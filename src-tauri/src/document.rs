use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex, RwLock},
};

use anyhow::Result;
use log::trace;
use yrs::{
    updates::decoder::Decode,
    *,
};

pub struct DocumentHolder {
    doc: Doc,
    path: PathBuf,
    is_modified: Arc<Mutex<bool>>,
}

impl Default for DocumentHolder {
    fn default() -> Self {
        Self {
            doc: Default::default(),
            path: Default::default(),
            is_modified: Arc::new(Mutex::new(false)),
        }
    }
}
impl DocumentHolder {
    fn load_document(filepath: PathBuf) -> Result<Self> {
        let doc = Doc::new();

        {
            let mut txn = doc.try_transact_mut()?;
            if filepath.exists() {
                let data = std::fs::read(&filepath)?;
                txn.apply_update(Update::decode_v1(&data)?)?;
                trace!(
                    "load {} bytes from document {}",
                    data.len(),
                    &filepath.to_string_lossy()
                );
            } else {
                trace!("document {} not found", &filepath.to_string_lossy());
            }
        }

        Ok(Self {
            doc,
            path: filepath,
            is_modified: Arc::new(Mutex::new(false)),
        })
    }

    fn save_document(&self) -> Result<()> {
        let data = self.get_data()?;
        let parent = self.path.parent().expect("Abnormal workspace structure");
        if !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&self.path, data)?;
        Ok(())
    }

    fn apply_change(&self, change: Update) -> Result<()> {
        let mut txn = self.doc.try_transact_mut()?;
        *self.is_modified.lock().unwrap() = true;
        txn.apply_update(change)?;
        Ok(())
    }

    fn get_data(&self) -> Result<Vec<u8>> {
        let txn = self.doc.try_transact()?;
        let empty_state_vector = StateVector::default();
        let data = txn.encode_state_as_update_v1(&empty_state_vector);
        Ok(data)
    }
}

pub struct DocumentRepo {
    docs: RwLock<HashMap<String, DocumentHolder>>,
}

impl DocumentRepo {
    pub fn new() -> Self {
        Self {
            docs: RwLock::new(HashMap::new()),
        }
    }

    pub fn manage(&self, doc_id: String, filepath: PathBuf) -> Result<Vec<u8>> {
        let doc = DocumentHolder::load_document(filepath)?;
        let snapshot = doc.get_data()?;
        self.docs.write().unwrap().insert(doc_id, doc);
        Ok(snapshot)
    }

    pub fn save_all(&self) -> Result<()> {
        for doc in self.docs.read().unwrap().values() {
            doc.save_document()?;
        }
        Ok(())
    }

    pub fn apply_change(&self, doc_id: &str, change: Vec<u8>) -> Result<()> {
        let change = Update::decode_v1(&change)?;
        let mut docs = self.docs.write().unwrap();
        let doc = docs.get_mut(doc_id).unwrap();
        doc.apply_change(change)?;
        doc.save_document()?;
        Ok(())
    }
}

impl AsRef<Doc> for DocumentHolder {
    fn as_ref(&self) -> &Doc {
        &self.doc
    }
}

impl AsMut<Doc> for DocumentHolder {
    fn as_mut(&mut self) -> &mut Doc {
        &mut self.doc
    }
}

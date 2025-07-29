use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex, RwLock},
};

use anyhow::Result;
use yrs::{updates::encoder::Encode, *};

use crate::model::Document;

pub struct DocumentRepo {
    docs: RwLock<HashMap<String, DocumentHolder>>,
}

pub struct DocumentHolder {
    doc: Doc,
    path: PathBuf,
    is_modified: Arc<Mutex<bool>>,
}

impl DocumentRepo {
    // fn load_document<P: AsRef<Path>>(
    //     &self,
    //     document_id: &str,
    //     filepath: P,
    // ) -> Result<DocumentHolder> {
    //     let doc = Doc::new();
    //     let mut txn = doc.try_transact_mut()?;
    //     if filepath.exists() {
    //         let data = std::fs::read(&filepath)?;
    //         txn.apply_update(data)?;
    //     }

    //     Ok(DocumentHolder {
    //         doc,
    //         path: filepath.into(),
    //         is_modified: Arc::new(Mutex::new(false)),
    //     })
    // }
    // pub fn manage<P: AsRef<Path>>(&mut self, doc_id: String, filepath: P) -> Result<()> {
    //     let doc = self.load_document(&doc_id, filepath)?;
    //     self.docs.write().unwrap().insert(doc_id, doc);
    //     Ok(())
    // }

    // pub fn apply_changes(&self, doc_id: &str, changes: Vec<Change>) -> Result<()> {
    //     let mut doc = self.docs.read().unwrap().get(doc_id).unwrap();
    //     doc.apply_changes(changes);
    //     doc.save()?;
    //     Ok(())
    // }
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

impl DocumentHolder {
    pub fn save(&self) -> Result<()> {
        let mut txn = self.doc.try_transact()?;
        let snapshot = txn.snapshot();
        let data = snapshot.encode_v1();
        std::fs::write(&self.path, data)?;
        Ok(())
    }
}

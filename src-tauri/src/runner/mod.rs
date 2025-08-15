use log::trace;
use once_cell::sync::Lazy;

static BUNDLED_CHECKER_NAME:Lazy<Vec<&str>> = Lazy::new(||{
    let chks = include_str!("bundle-chk.txt").lines().collect::<Vec<_>>();
    trace!("Bundled checker names: {:?}", &chks);
    chks
});

pub fn get_bundled_checker_names() -> &'static [&'static str] {
    &BUNDLED_CHECKER_NAME.as_ref()
}
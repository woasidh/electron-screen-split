pub const LOGIN_EXTENSION_SCRIPT: &str = include_str!("../scripts/login-extension.js");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn script_requires_exactly_one_candidate() {
        assert!(LOGIN_EXTENSION_SCRIPT.contains("candidates.length === 1"));
        assert!(LOGIN_EXTENSION_SCRIPT.contains("button.disabled"));
        assert!(LOGIN_EXTENSION_SCRIPT.contains("stamp--normal"));
    }
}

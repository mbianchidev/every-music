#[cfg(test)]
mod tests {
    use glib::variant::ToVariant;

    #[test]
    fn variant_string_iteration_is_sound_with_optimizations() {
        let strings = ["", "drums", "guitar", "keys", "voice", "bass"];
        let variant = strings.to_variant();
        let mut iter = variant.array_iter_str().expect("string array variant");

        assert_eq!(iter.len(), strings.len());
        assert_eq!(iter.next(), Some(strings[0]));
        assert_eq!(iter.nth(1), Some(strings[2]));
        assert_eq!(iter.next_back(), Some(strings[5]));
        assert_eq!(iter.nth_back(1), Some(strings[3]));
        assert_eq!(iter.len(), 0);
        assert_eq!(iter.next(), None);
        assert_eq!(iter.next_back(), None);
        assert_eq!(variant.array_iter_str().unwrap().last(), Some(strings[5]));
    }
}

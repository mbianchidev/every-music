#[cfg(test)]
mod tests {
    use glib::prelude::*;
    use glib::variant::ToVariant;

    #[test]
    fn charset_out_parameter_is_a_string() {
        let (_, charset) = glib::charset();

        assert!(!charset
            .expect("GLib provides the locale charset")
            .is_empty());
    }

    #[test]
    fn filename_uri_out_parameters_preserve_optional_hostnames() {
        let path = std::env::temp_dir().join("every-music-glib-regression.txt");

        for hostname in [None, Some("localhost")] {
            let uri = glib::filename_to_uri(&path, hostname).expect("valid synthetic file URI");
            let (restored_path, restored_hostname) =
                glib::filename_from_uri(&uri).expect("file URI round trip");

            assert_eq!(restored_path, path);
            assert_eq!(restored_hostname.as_deref(), hostname);
        }
    }

    #[test]
    fn invalid_filename_uri_returns_an_owned_error() {
        for uri in ["", "https://example.test/synthetic"] {
            let error = glib::filename_from_uri(uri).expect_err("not a file URI");
            let cloned = error.clone();
            drop(error);

            assert!(cloned.matches(glib::ConvertError::BadUri));
            assert!(!cloned.message().is_empty());
        }
    }

    #[test]
    fn string_values_preserve_contents_and_null_when_cloned() {
        for expected in [Some(String::from("synthetic")), Some(String::new()), None] {
            let value = expected.to_value();
            let cloned = value.clone();
            drop(value);

            assert_eq!(cloned.get::<Option<String>>().unwrap(), expected);
        }
    }

    #[test]
    fn object_value_copies_keep_the_object_alive_until_the_last_drop() {
        let object: glib::Object = glib::Object::new();
        let weak = object.downgrade();
        let value = object.to_value();
        let cloned = value.clone();
        drop(object);
        drop(value);

        let restored = cloned.get::<glib::Object>().unwrap();
        drop(cloned);
        assert!(weak.upgrade().is_some());

        drop(restored);
        assert!(weak.upgrade().is_none());
    }

    #[test]
    fn boxed_value_copy_owns_its_bytes_after_the_original_is_dropped() {
        let bytes = glib::Bytes::from_owned(vec![0, 1, 2, 255]);
        let value = bytes.to_value();
        let cloned = value.clone();
        drop(bytes);
        drop(value);

        let restored = cloned.get::<glib::Bytes>().unwrap();
        drop(cloned);

        assert_eq!(restored.as_ref(), &[0, 1, 2, 255]);
    }

    #[test]
    fn uuid_validation_returns_a_boolean_for_valid_and_invalid_input() {
        assert!(glib::uuid_string_is_valid(
            "00000000-0000-4000-8000-000000000000"
        ));

        for invalid in ["", "not-a-uuid", "00000000-0000-4000-8000-00000000000z"] {
            assert!(!glib::uuid_string_is_valid(invalid));
        }
    }

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

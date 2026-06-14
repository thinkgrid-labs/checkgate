use std::io::Cursor;

/// MurmurHash3 (x86_32) implementation for zero-allocation deterministic hashing.
/// This guarantees consistent evaluation across platforms.
///
/// `Cursor<&[u8]>` implements `Read` infallibly, so `murmur3_32` only returns
/// `Err` if the internal read fails — which cannot happen for an in-memory
/// buffer. The fallback to `0` is therefore unreachable in practice, but if it
/// were ever triggered all affected users would land in bucket 0, silently
/// skewing rollout distribution. The `debug_assert` catches this in testing.
pub fn murmurhash3_x86_32(key: &[u8], seed: u32) -> u32 {
    let mut cursor = Cursor::new(key);
    murmur3::murmur3_32(&mut cursor, seed)
        .expect("murmur3_32 on in-memory Cursor<&[u8]> is infallible")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_murmurhash3_x86_32() {
        // Test vectors for MurmurHash3 x86_32
        assert_eq!(murmurhash3_x86_32(b"hello", 0), 613153351);
        assert_eq!(murmurhash3_x86_32(b"hello world", 42), 3926694905);
        assert_eq!(murmurhash3_x86_32(b"", 0), 0);
    }
}

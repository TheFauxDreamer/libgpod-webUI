"""SHA1-based duplicate detection, matching gtkpod's algorithm exactly."""

import hashlib
import os
import struct


def sha1_hash(filename):
    """Compute SHA1 hash of file for duplicate detection.

    This mirrors gtkpod.sha1_hash() exactly:
    SHA1(struct.pack("<L", filesize) + first 16KB of file)

    This is the canonical duplicate detection algorithm used by
    gtkpod and libgpod's extended info system.
    """
    hash_len = 4 * 4096  # 16384 bytes
    h = hashlib.sha1()
    size = os.path.getsize(filename)
    h.update(struct.pack("<L", size))
    with open(filename, 'rb') as f:
        h.update(f.read(hash_len))
    return h.hexdigest()


def find_duplicates(file_paths, existing_hashes):
    """Check which files are duplicates of existing tracks.

    Args:
        file_paths: list of file paths to check
        existing_hashes: set of SHA1 hashes already on the iPod

    Returns:
        (new_files, duplicate_files) - two lists of file paths
    """
    new_files = []
    duplicate_files = []
    for path in file_paths:
        h = sha1_hash(path)
        if h in existing_hashes:
            duplicate_files.append(path)
        else:
            new_files.append(path)
    return new_files, duplicate_files

#!/usr/bin/env python3
"""Extract the verified Space Impact event scripts from a local 3310 v6.39 FLS.

Usage: python3 tools/extract_spaceimpact_tones.py /path/to/firmware.fls
Outputs JSON to stdout. The firmware image itself is never written into the project.
"""
import argparse
import json
import struct
from pathlib import Path

BASE = 0x200000
EVENT_TABLE = 0x321E6C
FREQUENCIES = 0x32AFD0
EVENTS = (0x17, 0x18, 0x19, 0x1A)


def extract(data):
    def view(address, length):
        offset = address - BASE
        if offset < 0 or offset + length > len(data):
            raise ValueError(f'address 0x{address:x} outside the flash image')
        return data[offset:offset + length]

    def u16(address):
        return struct.unpack('>H', view(address, 2))[0]

    def u32(address):
        return struct.unpack('>I', view(address, 4))[0]

    result = {}
    for event in EVENTS:
        entry = EVENT_TABLE + 8 * event
        pointer = u32(entry)
        if view(pointer, 2) != b'\x00\x09':
            raise ValueError(f'event 0x{event:02x} has an unexpected script prefix')
        offset, segments = 2, []
        while offset < 1024:
            note = view(pointer + offset, 1)[0]
            if note == 0x0B:
                break
            if not 0x41 <= note <= 0xA5:
                raise ValueError(f'unsupported byte 0x{note:02x} in event 0x{event:02x}')
            duration = view(pointer + offset + 1, 1)[0]
            segments.append([u16(FREQUENCIES + 2 * (note - 0x40)), duration])
            offset += 2
        else:
            raise ValueError(f'unterminated script for event 0x{event:02x}')
        result[str(event)] = {'entry': f'0x{entry:06x}', 'address': f'0x{pointer:06x}',
                              'bytes': view(pointer, offset + 1).hex(), 'segments': segments}
    return {'tick_ms': 7.96875, 'events': result}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('firmware', type=Path)
    args = parser.parse_args()
    print(json.dumps(extract(args.firmware.read_bytes()), indent=2))

/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

#![no_std]

use core::arch::wasm32::{memory_grow, memory_size};
use core::panic::PanicInfo;
use core::ptr::{addr_of, addr_of_mut, copy_nonoverlapping, read, write};

const PAGE_SIZE: usize = 65_536;
const QUERY_CAPACITY: usize = 4_096;
const TEXT: u8 = 0;
const ESCAPE: u8 = 1;
const CSI: u8 = 2;
const OSC: u8 = 3;
const OSC_ESCAPE: u8 = 4;

unsafe extern "C" {
    static __heap_base: u8;
}

static mut INDEX_PTR: usize = 0;
static mut INPUT_PTR: usize = 0;
static mut QUERY_PTR: usize = 0;
static mut SEARCH_CAP: usize = 0;
static mut STORAGE_CAP: usize = 0;
static mut INPUT_CAP: usize = 0;
static mut HEAD: usize = 0;
static mut INDEX_LEN: usize = 0;
static mut QUERY_LEN: usize = 0;
static mut SHIFTS: [usize; 256] = [0; 256];
static mut PARSER_STATE: u8 = TEXT;
static mut OVERFLOWED: bool = false;

#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    loop {}
}

#[unsafe(no_mangle)]
pub extern "C" fn configure(search_cap: u32, trim_margin: u32, input_cap: u32) -> u32 {
    let search_cap = search_cap as usize;
    let input_cap = input_cap as usize;
    let Some(storage_cap) = search_cap.checked_add(trim_margin as usize) else {
        return 0;
    };
    if search_cap == 0 || input_cap == 0 {
        return 0;
    }

    let base = align_up(addr_of!(__heap_base) as usize, 8);
    let Some(input_ptr) = base.checked_add(storage_cap) else {
        return 0;
    };
    let Some(query_ptr) = input_ptr.checked_add(input_cap) else {
        return 0;
    };
    let Some(required_bytes) = query_ptr.checked_add(QUERY_CAPACITY) else {
        return 0;
    };

    let current_pages = memory_size::<0>();
    let required_pages = required_bytes.div_ceil(PAGE_SIZE);
    if required_pages > current_pages
        && memory_grow::<0>(required_pages - current_pages) == usize::MAX
    {
        return 0;
    }

    unsafe {
        INDEX_PTR = base;
        INPUT_PTR = input_ptr;
        QUERY_PTR = query_ptr;
        SEARCH_CAP = search_cap;
        STORAGE_CAP = storage_cap;
        INPUT_CAP = input_cap;
    }
    reset();
    input_ptr as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn reset() {
    unsafe {
        HEAD = 0;
        INDEX_LEN = 0;
        QUERY_LEN = 0;
        PARSER_STATE = TEXT;
        OVERFLOWED = false;
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn append(input_len: u32) -> u32 {
    let input_len = input_len as usize;
    if input_len > unsafe { INPUT_CAP } {
        return 0;
    }

    unsafe {
        OVERFLOWED = false;
        push_index_byte(b'\n');
        for offset in 0..input_len {
            process_input_byte(read((INPUT_PTR + offset) as *const u8));
        }
        if OVERFLOWED && INDEX_LEN > SEARCH_CAP {
            HEAD = (HEAD + INDEX_LEN - SEARCH_CAP) % STORAGE_CAP;
            INDEX_LEN = SEARCH_CAP;
        }
    }
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn set_query(input_len: u32) -> u32 {
    let input_len = input_len as usize;
    if input_len > unsafe { INPUT_CAP } || input_len > QUERY_CAPACITY {
        return 0;
    }
    unsafe {
        copy_nonoverlapping(INPUT_PTR as *const u8, QUERY_PTR as *mut u8, input_len);
        QUERY_LEN = input_len;
        let shifts = addr_of_mut!(SHIFTS) as *mut usize;
        for byte in 0..256 {
            write(shifts.add(byte), input_len);
        }
        for index in 0..input_len.saturating_sub(1) {
            let byte = read((QUERY_PTR + index) as *const u8);
            write(shifts.add(byte as usize), input_len - index - 1);
        }
    }
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn contains() -> u32 {
    let query_len = unsafe { QUERY_LEN };
    let index_len = unsafe { INDEX_LEN };
    if query_len == 0 {
        return 1;
    }
    if query_len > index_len {
        return 0;
    }

    let mut start = 0;
    while start + query_len <= index_len {
        let mut query_offset = query_len;
        while query_offset > 0 {
            query_offset -= 1;
            let index_byte = unsafe { logical_index_byte(start + query_offset) };
            let query_byte = unsafe { read((QUERY_PTR + query_offset) as *const u8) };
            if index_byte != query_byte {
                break;
            }
        }
        if query_offset == 0 && unsafe { logical_index_byte(start) == read(QUERY_PTR as *const u8) }
        {
            return 1;
        }
        let last_byte = unsafe { logical_index_byte(start + query_len - 1) };
        start += unsafe { read((addr_of!(SHIFTS) as *const usize).add(last_byte as usize)) };
    }
    0
}

#[unsafe(no_mangle)]
pub extern "C" fn index_len() -> u32 {
    unsafe { INDEX_LEN as u32 }
}

unsafe fn process_input_byte(byte: u8) {
    match PARSER_STATE {
        TEXT => process_text_byte(byte),
        ESCAPE => match byte {
            b'[' => PARSER_STATE = CSI,
            b']' => PARSER_STATE = OSC,
            _ => {
                PARSER_STATE = TEXT;
                process_text_byte(byte);
            }
        },
        CSI => {
            if (0x40..=0x7e).contains(&byte) {
                PARSER_STATE = TEXT;
            }
        }
        OSC => match byte {
            0x07 => PARSER_STATE = TEXT,
            0x1b => PARSER_STATE = OSC_ESCAPE,
            _ => {}
        },
        OSC_ESCAPE => match byte {
            b'\\' => PARSER_STATE = TEXT,
            0x1b => {}
            _ => PARSER_STATE = OSC,
        },
        _ => PARSER_STATE = TEXT,
    }
}

unsafe fn process_text_byte(byte: u8) {
    if byte == 0x1b {
        PARSER_STATE = ESCAPE;
    } else if byte == 0x7f || (byte < 0x20 && byte != b'\t' && byte != b'\n' && byte != b'\r') {
        // Matches the renderer's control-byte filter.
    } else {
        push_index_byte(byte);
    }
}

unsafe fn push_index_byte(byte: u8) {
    if INDEX_LEN < STORAGE_CAP {
        let position = (HEAD + INDEX_LEN) % STORAGE_CAP;
        write((INDEX_PTR + position) as *mut u8, byte);
        INDEX_LEN += 1;
    } else {
        write((INDEX_PTR + HEAD) as *mut u8, byte);
        HEAD = (HEAD + 1) % STORAGE_CAP;
        OVERFLOWED = true;
    }
}

unsafe fn logical_index_byte(offset: usize) -> u8 {
    let physical = HEAD + offset;
    let position = if physical >= STORAGE_CAP {
        physical - STORAGE_CAP
    } else {
        physical
    };
    read((INDEX_PTR + position) as *const u8)
}

const fn align_up(value: usize, alignment: usize) -> usize {
    (value + alignment - 1) & !(alignment - 1)
}

//! owos-ffi — the C ABI plugin surface for the notherworld engine.
//!
//! This is what makes the engine a *plugin* rather than a program: a flat set
//! of `extern "C"` functions over an opaque world handle, so a host engine
//! (Unreal/C++, Godot/GDExtension, Unity/C#) can create a living world, step it,
//! push player actions in, and read entity state back out to render. The host
//! owns the frame loop and the graphics; this owns the world's mind.
//!
//! Contract: create → (build or load a scenario) → loop { push actions; step;
//! read state to render } → free. Strings returned by the library must be freed
//! with `owos_free_string`. Everything here is `#[no_mangle] extern "C"`.
//!
//! PANIC SAFETY: a Rust panic must never unwind across the C boundary (that is
//! undefined behavior). Every export is wrapped in `catch_unwind`: on an
//! internal panic the call becomes a no-op returning a neutral default, and the
//! panic message is stored — poll `owos_last_error()` to retrieve it (returns
//! NULL when no error; caller frees the string). Out-of-range indices from the
//! host are additionally checked up front and reported the same way.

use std::ffi::{c_char, c_void, CStr, CString};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::Mutex;

use owos_core::engine::{Broadcast, Reducer, Rollup, System, World};

// --- handle + string helpers ---

type WorldPtr = *mut c_void;

#[inline]
fn world<'a>(p: WorldPtr) -> &'a mut World {
    unsafe { &mut *(p as *mut World) }
}

#[inline]
fn s<'a>(p: *const c_char) -> &'a str {
    if p.is_null() {
        return "";
    }
    unsafe { CStr::from_ptr(p).to_str().unwrap_or("") }
}

#[inline]
fn out(text: &str) -> *mut c_char {
    CString::new(text).unwrap_or_default().into_raw()
}

// --- panic guard: no unwind may cross into C ---

static LAST_ERROR: Mutex<Option<String>> = Mutex::new(None);

fn record_error(payload: Box<dyn std::any::Any + Send>) {
    let msg = payload
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .or_else(|| payload.downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "engine panic (no message)".to_string());
    if let Ok(mut slot) = LAST_ERROR.lock() {
        *slot = Some(msg);
    }
}

/// Run an export body; on panic, record the message and return `default`.
fn guard<T>(default: T, f: impl FnOnce() -> T) -> T {
    match catch_unwind(AssertUnwindSafe(f)) {
        Ok(v) => v,
        Err(payload) => {
            record_error(payload);
            default
        }
    }
}

/// The last engine error (panic message), or NULL if none. Reading it clears
/// it. Caller frees the returned string with `owos_free_string`.
#[no_mangle]
pub extern "C" fn owos_last_error() -> *mut c_char {
    let taken = LAST_ERROR.lock().ok().and_then(|mut slot| slot.take());
    match taken {
        Some(msg) => out(&msg),
        None => std::ptr::null_mut(),
    }
}

// --- a demo scenario so a host can immediately drive a living world ---

struct Discontent;
impl System for Discontent {
    fn name(&self) -> &str {
        "discontent"
    }
    fn tick(&self, w: &mut World) {
        for id in w.active_by_kind("citizen") {
            let hardship = w.stat(id, "hardship");
            let fear = w.stat(id, "fear");
            let target = (0.35 * hardship + 0.60 * fear).clamp(0.0, 1.0);
            let cur = w.stat(id, "discontent");
            w.set(id, "discontent", (cur + 0.30 * (target - cur)).clamp(0.0, 1.0));
        }
    }
}

fn build_demo(w: &mut World) {
    let root = w.root;
    for n in 0..2 {
        let nation = w.spawn("nation", &format!("Nation {n}"), root);
        w.set(nation, "at_war", 0.0);
        for c in 0..2 {
            let city = w.spawn("city", &format!("City {n}.{c}"), nation);
            for p in 0..3 {
                let cit = w.spawn("citizen", &format!("Citizen {n}.{c}.{p}"), city);
                w.set(cit, "hardship", 0.15 + 0.10 * ((n + c + p) % 3) as f32);
                w.set(cit, "discontent", 0.2);
            }
        }
    }
    w.add_system(Box::new(Discontent));
    w.add_broadcast(Broadcast { parent_kind: String::new(), parent_stat: "at_war".into(), child_stat: "war_danger".into(), gain: 1.0 });
    w.add_broadcast(Broadcast { parent_kind: String::new(), parent_stat: "war_danger".into(), child_stat: "fear".into(), gain: 1.0 });
    w.add_rollup(Rollup { parent_kind: "city".into(), child_stat: "discontent".into(), parent_stat: "unrest".into(), reducer: Reducer::Mean, drain: false });
    w.add_rollup(Rollup { parent_kind: "nation".into(), child_stat: "unrest".into(), parent_stat: "instability".into(), reducer: Reducer::Mean, drain: false });
    w.add_rollup(Rollup { parent_kind: "world".into(), child_stat: "instability".into(), parent_stat: "tension".into(), reducer: Reducer::Mean, drain: false });
}

// ============================ the C ABI ============================

/// Create an empty world (root only) — the host builds it with `owos_spawn`/`owos_set`.
#[no_mangle]
pub extern "C" fn owos_new(seed: u64) -> WorldPtr {
    guard(std::ptr::null_mut(), || Box::into_raw(Box::new(World::new(seed))) as WorldPtr)
}

/// Create a world pre-populated with the demo scenario (nations→cities→citizens).
#[no_mangle]
pub extern "C" fn owos_new_demo(seed: u64) -> WorldPtr {
    guard(std::ptr::null_mut(), || {
        let mut w = World::new(seed);
        build_demo(&mut w);
        Box::into_raw(Box::new(w)) as WorldPtr
    })
}

/// Destroy a world.
#[no_mangle]
pub extern "C" fn owos_free(p: WorldPtr) {
    guard((), || {
        if !p.is_null() {
            unsafe { drop(Box::from_raw(p as *mut World)) };
        }
    })
}

/// Advance the simulation one tick.
#[no_mangle]
pub extern "C" fn owos_step(p: WorldPtr) {
    guard((), || world(p).step())
}

/// The current tick count.
#[no_mangle]
pub extern "C" fn owos_tick(p: WorldPtr) -> u64 {
    guard(0, || world(p).tick)
}

/// The root entity's id (always 0).
#[no_mangle]
pub extern "C" fn owos_root(_p: WorldPtr) -> u32 {
    0
}

/// Spawn a child entity; returns its id.
#[no_mangle]
pub extern "C" fn owos_spawn(p: WorldPtr, kind: *const c_char, name: *const c_char, parent: u32) -> u32 {
    guard(0, || world(p).spawn(s(kind), s(name), parent as usize) as u32)
}

/// Read / write / accumulate a stat.
#[no_mangle]
pub extern "C" fn owos_get(p: WorldPtr, id: u32, key: *const c_char) -> f32 {
    guard(0.0, || world(p).stat(id as usize, s(key)))
}
#[no_mangle]
pub extern "C" fn owos_set(p: WorldPtr, id: u32, key: *const c_char, v: f32) {
    guard((), || world(p).set(id as usize, s(key), v))
}
#[no_mangle]
pub extern "C" fn owos_add(p: WorldPtr, id: u32, key: *const c_char, delta: f32) {
    guard((), || world(p).add(id as usize, s(key), delta))
}

/// Player/host actions — the input channel, at any scale.
#[no_mangle]
pub extern "C" fn owos_act_set(p: WorldPtr, id: u32, key: *const c_char, v: f32) {
    guard((), || world(p).act_set(id as usize, s(key), v))
}
#[no_mangle]
pub extern "C" fn owos_act_add(p: WorldPtr, id: u32, key: *const c_char, delta: f32) {
    guard((), || world(p).act_add(id as usize, s(key), delta))
}
#[no_mangle]
pub extern "C" fn owos_set_intent(p: WorldPtr, id: u32, action: *const c_char) {
    guard((), || world(p).set_intent(id as usize, s(action)))
}

/// Simulation-LOD: zoom a scope in (reveal/unfold) or out (fold).
#[no_mangle]
pub extern "C" fn owos_reveal(p: WorldPtr, id: u32) {
    guard((), || world(p).reveal(id as usize))
}
#[no_mangle]
pub extern "C" fn owos_fold(p: WorldPtr, id: u32) {
    guard((), || world(p).fold(id as usize))
}

/// Tree traversal so the host can walk the world it renders.
#[no_mangle]
pub extern "C" fn owos_child_count(p: WorldPtr, id: u32) -> u32 {
    guard(0, || world(p).children(id as usize).len() as u32)
}
/// The child at `index`, or `u32::MAX` if the index is out of range
/// (also reported via `owos_last_error`).
#[no_mangle]
pub extern "C" fn owos_child(p: WorldPtr, id: u32, index: u32) -> u32 {
    guard(u32::MAX, || {
        let kids = world(p).children(id as usize);
        match kids.get(index as usize) {
            Some(&c) => c as u32,
            None => {
                if let Ok(mut slot) = LAST_ERROR.lock() {
                    *slot = Some(format!("owos_child: index {index} out of range for entity {id} ({} children)", kids.len()));
                }
                u32::MAX
            }
        }
    })
}

/// An entity's name (caller frees with `owos_free_string`).
#[no_mangle]
pub extern "C" fn owos_name(p: WorldPtr, id: u32) -> *mut c_char {
    guard(std::ptr::null_mut(), || out(world(p).name(id as usize)))
}

/// Notable events since creation — the host drives VFX/quests off these.
#[no_mangle]
pub extern "C" fn owos_log_len(p: WorldPtr) -> u32 {
    guard(0, || world(p).log.len() as u32)
}
/// The log message at `index`, or NULL if out of range
/// (also reported via `owos_last_error`).
#[no_mangle]
pub extern "C" fn owos_log_message(p: WorldPtr, index: u32) -> *mut c_char {
    guard(std::ptr::null_mut(), || {
        match world(p).log.get(index as usize) {
            Some(entry) => out(&entry.message),
            None => {
                if let Ok(mut slot) = LAST_ERROR.lock() {
                    *slot = Some(format!("owos_log_message: index {index} out of range"));
                }
                std::ptr::null_mut()
            }
        }
    })
}

/// Free a string returned by this library.
#[no_mangle]
pub extern "C" fn owos_free_string(p: *mut c_char) {
    if !p.is_null() {
        unsafe { drop(CString::from_raw(p)) };
    }
}

// ── tests: the panic guard is a contract, so it gets enforced by `cargo test` ──
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hostile_indices_return_sentinels_not_crashes() {
        let w = owos_new_demo(1);
        assert!(!w.is_null());
        // out-of-range child index → sentinel + error message, no UB
        let bad = owos_child(w, 0, 9999);
        assert_eq!(bad, u32::MAX);
        let err = owos_last_error();
        assert!(!err.is_null(), "expected an error message");
        owos_free_string(err);
        // reading cleared it
        assert!(owos_last_error().is_null());
        // out-of-range log index → NULL, no crash
        assert!(owos_log_message(w, 9999).is_null());
        owos_free_string(owos_last_error());
        // the world is still alive and steppable after abuse
        owos_step(w);
        assert_eq!(owos_tick(w), 1);
        owos_free(w);
    }

    #[test]
    fn demo_scenario_still_byte_identical() {
        // the EMBED.md numbers, enforced: seed 1, 8 steps → 0.09; war +14 → 0.38
        let w = owos_new_demo(1);
        for _ in 0..8 { owos_step(w); }
        let t8 = owos_get(w, 0, std::ffi::CString::new("tension").unwrap().as_ptr());
        assert_eq!(format!("{t8:.2}"), "0.09");
        let n0 = owos_child(w, 0, 0);
        owos_act_set(w, n0, std::ffi::CString::new("at_war").unwrap().as_ptr(), 1.0);
        for _ in 0..14 { owos_step(w); }
        let tw = owos_get(w, 0, std::ffi::CString::new("tension").unwrap().as_ptr());
        assert_eq!(format!("{tw:.2}"), "0.38");
        owos_free(w);
    }
}

//! owos-ffi — the C ABI plugin surface for otherworldOS.
//!
//! This is what makes otherworldOS a *plugin* rather than a program: a flat set
//! of `extern "C"` functions over an opaque world handle, so a host engine
//! (Unreal/C++, Godot/GDExtension, Unity/C#) can create a living world, step it,
//! push player actions in, and read entity state back out to render. The host
//! owns the frame loop and the graphics; this owns the world's mind.
//!
//! Contract: create → (build or load a scenario) → loop { push actions; step;
//! read state to render } → free. Strings returned by the library must be freed
//! with `owos_free_string`. Everything here is `#[no_mangle] extern "C"`.

use std::ffi::{c_char, c_void, CStr, CString};

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
    Box::into_raw(Box::new(World::new(seed))) as WorldPtr
}

/// Create a world pre-populated with the demo scenario (nations→cities→citizens).
#[no_mangle]
pub extern "C" fn owos_new_demo(seed: u64) -> WorldPtr {
    let mut w = World::new(seed);
    build_demo(&mut w);
    Box::into_raw(Box::new(w)) as WorldPtr
}

/// Destroy a world.
#[no_mangle]
pub extern "C" fn owos_free(p: WorldPtr) {
    if !p.is_null() {
        unsafe { drop(Box::from_raw(p as *mut World)) };
    }
}

/// Advance the simulation one tick.
#[no_mangle]
pub extern "C" fn owos_step(p: WorldPtr) {
    world(p).step();
}

/// The current tick count.
#[no_mangle]
pub extern "C" fn owos_tick(p: WorldPtr) -> u64 {
    world(p).tick
}

/// The root entity's id (always 0).
#[no_mangle]
pub extern "C" fn owos_root(_p: WorldPtr) -> u32 {
    0
}

/// Spawn a child entity; returns its id.
#[no_mangle]
pub extern "C" fn owos_spawn(p: WorldPtr, kind: *const c_char, name: *const c_char, parent: u32) -> u32 {
    world(p).spawn(s(kind), s(name), parent as usize) as u32
}

/// Read / write / accumulate a stat.
#[no_mangle]
pub extern "C" fn owos_get(p: WorldPtr, id: u32, key: *const c_char) -> f32 {
    world(p).stat(id as usize, s(key))
}
#[no_mangle]
pub extern "C" fn owos_set(p: WorldPtr, id: u32, key: *const c_char, v: f32) {
    world(p).set(id as usize, s(key), v);
}
#[no_mangle]
pub extern "C" fn owos_add(p: WorldPtr, id: u32, key: *const c_char, delta: f32) {
    world(p).add(id as usize, s(key), delta);
}

/// Player/host actions — the input channel, at any scale.
#[no_mangle]
pub extern "C" fn owos_act_set(p: WorldPtr, id: u32, key: *const c_char, v: f32) {
    world(p).act_set(id as usize, s(key), v);
}
#[no_mangle]
pub extern "C" fn owos_act_add(p: WorldPtr, id: u32, key: *const c_char, delta: f32) {
    world(p).act_add(id as usize, s(key), delta);
}
#[no_mangle]
pub extern "C" fn owos_set_intent(p: WorldPtr, id: u32, action: *const c_char) {
    world(p).set_intent(id as usize, s(action));
}

/// Simulation-LOD: zoom a scope in (reveal/unfold) or out (fold).
#[no_mangle]
pub extern "C" fn owos_reveal(p: WorldPtr, id: u32) {
    world(p).reveal(id as usize);
}
#[no_mangle]
pub extern "C" fn owos_fold(p: WorldPtr, id: u32) {
    world(p).fold(id as usize);
}

/// Tree traversal so the host can walk the world it renders.
#[no_mangle]
pub extern "C" fn owos_child_count(p: WorldPtr, id: u32) -> u32 {
    world(p).children(id as usize).len() as u32
}
#[no_mangle]
pub extern "C" fn owos_child(p: WorldPtr, id: u32, index: u32) -> u32 {
    world(p).children(id as usize)[index as usize] as u32
}

/// An entity's name (caller frees with `owos_free_string`).
#[no_mangle]
pub extern "C" fn owos_name(p: WorldPtr, id: u32) -> *mut c_char {
    out(world(p).name(id as usize))
}

/// Notable events since creation — the host drives VFX/quests off these.
#[no_mangle]
pub extern "C" fn owos_log_len(p: WorldPtr) -> u32 {
    world(p).log.len() as u32
}
#[no_mangle]
pub extern "C" fn owos_log_message(p: WorldPtr, index: u32) -> *mut c_char {
    out(&world(p).log[index as usize].message)
}

/// Free a string returned by this library.
#[no_mangle]
pub extern "C" fn owos_free_string(p: *mut c_char) {
    if !p.is_null() {
        unsafe { drop(CString::from_raw(p)) };
    }
}

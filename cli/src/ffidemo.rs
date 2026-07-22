//! ffidemo — a HOST driving otherworldOS through the C ABI, exactly as Unreal
//! or Godot would. It never touches the Rust types; it only calls the plugin's
//! `extern "C"` functions with an opaque handle and C strings. If this works,
//! a C++ host calling the identical functions works.

use owos_ffi::*;
use std::ffi::{CStr, CString};

fn key(name: &str) -> CString {
    CString::new(name).unwrap()
}

fn get(w: *mut std::ffi::c_void, id: u32, k: &str) -> f32 {
    owos_get(w, id, key(k).as_ptr())
}

fn name(w: *mut std::ffi::c_void, id: u32) -> String {
    let ptr = owos_name(w, id);
    let s = unsafe { CStr::from_ptr(ptr).to_string_lossy().into_owned() };
    owos_free_string(ptr);
    s
}

fn main() {
    println!("(host) linking owos_ffi and driving a world through the C ABI\n");

    // The host creates a living world through the plugin.
    let w = owos_new_demo(1);
    let root = owos_root(w);
    let nation0 = owos_child(w, root, 0);

    // Run a few frames (the host's game loop would call this).
    for _ in 0..8 {
        owos_step(w);
    }
    println!("(host) after 8 steps · world '{}' tension = {:.2}", "tension", get(w, root, "tension"));

    // Player does something -> the host forwards it as an action at the nation scale.
    owos_act_set(w, nation0, key("at_war").as_ptr(), 1.0);
    println!("(host) player action forwarded: {} declares war", name(w, nation0));

    for _ in 0..14 {
        owos_step(w);
    }
    println!("(host) tension now = {:.2}  (propagated down to citizens and up to the world)", get(w, root, "tension"));

    // Read individual state back out, to render it.
    let city = owos_child(w, nation0, 0);
    let citizen = owos_child(w, city, 0);
    println!("(host) reading a leaf entity to render: {} · discontent = {:.2}", name(w, citizen), get(w, citizen, "discontent"));

    // Zoom out (fold) a peaceful nation — the host would stop rendering its detail.
    let nation1 = owos_child(w, root, 1);
    owos_fold(w, nation1);
    println!("(host) folded {} (offscreen) — it keeps running coarse for near-zero cost", name(w, nation1));

    owos_free(w);
    println!("\n(host) freed the world. This is the entire integration surface — same calls from C++/Unreal.");
}

/* host.c — a NATIVE C host driving otherworldOS through its C ABI, exactly as
 * an Unreal (C++) or Godot (GDExtension C++) integration would. It includes only
 * owos.h and links owos_ffi.dll; it never sees a Rust type. The host owns the
 * frame loop and (in a real game) the renderer; the plugin owns the living world.
 *
 * Build (any C compiler — here shown with zig cc / clang; cl or gcc identical):
 *   zig cc host.c -I ../../engine/owos-ffi/include \
 *       ../../target/release/owos_ffi.dll.lib -o host.exe
 * Run with owos_ffi.dll on the search path.
 */
#include <stdio.h>
#include "owos.h"

int main(void) {
    printf("(C host) #include owos.h, link owos_ffi.dll — the Unreal/Godot integration surface\n\n");

    /* The host creates a living world through the plugin. */
    OwosWorld* w = owos_new_demo(1);
    uint32_t root = owos_root(w);
    uint32_t nation0 = owos_child(w, root, 0);

    /* The host's frame loop — step the sim (can run slower than render fps). */
    for (int i = 0; i < 8; i++) owos_step(w);
    printf("(C host) after 8 steps  tension = %.2f\n", owos_get(w, root, "tension"));

    /* Player did something -> forward it as an action at the nation scale. */
    owos_act_set(w, nation0, "at_war", 1.0f);
    char* n0 = owos_name(w, nation0);
    printf("(C host) player action forwarded: %s declares war\n", n0);
    owos_free_string(n0);

    for (int i = 0; i < 14; i++) owos_step(w);
    printf("(C host) tension now = %.2f  (propagated down to citizens and back up)\n", owos_get(w, root, "tension"));

    /* Read a leaf entity back out, to render it. */
    uint32_t city = owos_child(w, nation0, 0);
    uint32_t citizen = owos_child(w, city, 0);
    char* cn = owos_name(w, citizen);
    printf("(C host) reading a leaf to render: %s  discontent = %.2f\n", cn, owos_get(w, citizen, "discontent"));
    owos_free_string(cn);

    /* Zoom out (fold) a peaceful nation — the host stops rendering its detail. */
    uint32_t nation1 = owos_child(w, root, 1);
    owos_fold(w, nation1);
    char* n1 = owos_name(w, nation1);
    printf("(C host) folded %s (offscreen) — it keeps running coarse for near-zero cost\n", n1);
    owos_free_string(n1);

    owos_free(w);
    printf("\n(C host) freed the world. This is the entire integration surface.\n");
    return 0;
}

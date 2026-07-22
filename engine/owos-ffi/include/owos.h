/* owos.h — C ABI for the otherworldOS plugin.
 *
 * Link owos_ffi (owos_ffi.dll / .so / .dylib) and #include this from your host
 * engine (Unreal C++, Godot GDExtension, Unity C# via P/Invoke). The host owns
 * rendering, physics, input, and the frame loop; otherworldOS owns the living
 * world. Typical use:
 *
 *     OwosWorld* w = owos_new_demo(42);
 *     for (;;) {                       // your game loop
 *         // ... player did something ...
 *         owos_act_set(w, nationId, "at_war", 1.0f);
 *         owos_step(w);                // advance the sim (can be < 60fps)
 *         float tension = owos_get(w, owos_root(w), "tension");
 *         // ... read entity stats, render the world ...
 *     }
 *     owos_free(w);
 */
#ifndef OWOS_H
#define OWOS_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void OwosWorld;

/* lifecycle */
OwosWorld* owos_new(uint64_t seed);        /* empty world (root only)          */
OwosWorld* owos_new_demo(uint64_t seed);   /* pre-built nations/cities/citizens */
void       owos_free(OwosWorld* w);
void       owos_step(OwosWorld* w);
uint64_t   owos_tick(OwosWorld* w);
uint32_t   owos_root(OwosWorld* w);

/* build the tree */
uint32_t   owos_spawn(OwosWorld* w, const char* kind, const char* name, uint32_t parent);

/* stats */
float      owos_get(OwosWorld* w, uint32_t id, const char* key);
void       owos_set(OwosWorld* w, uint32_t id, const char* key, float v);
void       owos_add(OwosWorld* w, uint32_t id, const char* key, float delta);

/* input channel — player/host actions at any scale */
void       owos_act_set(OwosWorld* w, uint32_t id, const char* key, float v);
void       owos_act_add(OwosWorld* w, uint32_t id, const char* key, float delta);
void       owos_set_intent(OwosWorld* w, uint32_t id, const char* action);

/* Simulation-LOD */
void       owos_reveal(OwosWorld* w, uint32_t id);
void       owos_fold(OwosWorld* w, uint32_t id);

/* traversal */
uint32_t   owos_child_count(OwosWorld* w, uint32_t id);
uint32_t   owos_child(OwosWorld* w, uint32_t id, uint32_t index);
char*      owos_name(OwosWorld* w, uint32_t id);       /* free with owos_free_string */

/* notable events */
uint32_t   owos_log_len(OwosWorld* w);
char*      owos_log_message(OwosWorld* w, uint32_t index); /* free with owos_free_string */

void       owos_free_string(char* s);

#ifdef __cplusplus
}
#endif

#endif /* OWOS_H */

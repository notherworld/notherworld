/* @ts-self-types="./owos_wasm.d.ts" */

/**
 * An opaque handle to a live scope-tree world. JS holds this plus bare entity
 * ids (numbers) and re-resolves them each call — no Rust references cross over.
 */
export class Scope {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ScopeFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_scope_free(ptr, 0);
    }
    /**
     * @param {number} id
     */
    clear_intent(id) {
        wasm.scope_clear_intent(this.__wbg_ptr, id);
    }
    /**
     * Compact the event log (fold-for-facts — docs/LEDGER.md): entries older
     * than `before_tick` collapse into exact per-label count summaries; each
     * label's first-ever moment and anything matching a comma-separated `keep`
     * pattern survive verbatim. Long-session hosts call this when the log
     * crosses their budget. Returns entries removed. Never touches sim state.
     * @param {bigint} before_tick
     * @param {string} keep_csv
     * @returns {number}
     */
    compact_log(before_tick, keep_csv) {
        const ptr0 = passStringToWasm0(keep_csv, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.scope_compact_log(this.__wbg_ptr, before_tick, ptr0, len0);
        return ret >>> 0;
    }
    /**
     * THE TILE WORLD: materialize the world tile at grid cell (tx, ty) — a fresh
     * copy of the spec's primary seed whose patch is [tx..tx+1, ty..ty+1]. The
     * global fields make adjacent tiles CONTINUOUS land; only the entity layer is
     * per-tile. Idempotent. Returns the tile's entity id.
     * @param {number} tx
     * @param {number} ty
     * @returns {number}
     */
    ensure_tile(tx, ty) {
        const ret = wasm.scope_ensure_tile(this.__wbg_ptr, tx, ty);
        return ret;
    }
    /**
     * The generic flow/watershed grids for a field, as one JSON object:
     * `{n, fill:[…], pool:[…], down:[…], accum:[…]}`, all n×n row-major over the
     * unit square. `pool > 0` = a filled basin (lake); `accum` = upstream cells
     * draining through (a renderer reads high accum as a river, and follows
     * `down` to animate flow). Domain-agnostic: works on ANY field.
     * @param {string} field
     * @param {number} n
     * @returns {string}
     */
    flow_json(field, n) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(field, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.scope_flow_json(this.__wbg_ptr, ptr0, len0, n);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Zoom OUT: fold `id` back to a coarse aggregate.
     * @param {number} id
     */
    fold(id) {
        wasm.scope_fold(this.__wbg_ptr, id);
    }
    /**
     * STREAMING: fold every revealed `kind` scope fully OUTSIDE the rect back to
     * a coarse aggregate — the memory half (canon stays written; simulation there
     * goes cheap). Call with the camera window + margin as the player moves on.
     * @param {number} x0
     * @param {number} y0
     * @param {number} x1
     * @param {number} y1
     * @param {string} kind
     * @returns {number}
     */
    fold_outside(x0, y0, x1, y1, kind) {
        const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.scope_fold_outside(this.__wbg_ptr, x0, y0, x1, y1, ptr0, len0);
        return ret >>> 0;
    }
    /**
     * Build a world from a self-bootstrapping JSON spec (see owos-author).
     * @param {string} spec_json
     */
    constructor(spec_json) {
        const ptr0 = passStringToWasm0(spec_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.scope_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        ScopeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Turn the built-in recorder (content oracle) on/off.
     * @param {boolean} on
     */
    record(on) {
        wasm.scope_record(this.__wbg_ptr, on);
    }
    /**
     * Which child parcel of `parent` owns the local point (x,y)? −1 = none.
     * Topological collision as an engine query.
     * @param {number} parent
     * @param {number} x
     * @param {number} y
     * @returns {number}
     */
    region_at(parent, x, y) {
        const ret = wasm.scope_region_at(this.__wbg_ptr, parent, x, y);
        return ret;
    }
    /**
     * A carved parcel's TRUE shape: `[cellSize, x0,y0, x1,y1, …]` (owned cell
     * centres, parent-local 0..1). Empty array if the entity has no carved region.
     * Renderers draw THIS, not the bbox — a coastal parcel's bbox lies about it.
     * @param {number} id
     * @returns {string}
     */
    region_json(id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.scope_region_json(this.__wbg_ptr, id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Zoom IN: reveal `id` (materialize + write canon) and band its fresh
     * children as Coarse "ideas" to zoom next — the feathered dive.
     * @param {number} id
     */
    reveal(id) {
        wasm.scope_reveal(this.__wbg_ptr, id);
    }
    /**
     * STREAMING (rect API — the camera speaks world rects, not ids): reveal every
     * `kind` scope intersecting the rect — first visits write canon, returning
     * folded scopes unfold — and park each one's fresh children Coarse (same
     * feathered-dive semantics as `reveal`). Feed it the camera window + a
     * lookahead margin and the data arrives before the player does. Returns how
     * many scopes were touched.
     * @param {number} x0
     * @param {number} y0
     * @param {number} x1
     * @param {number} y1
     * @param {string} kind
     * @returns {number}
     */
    reveal_rect(x0, y0, x1, y1, kind) {
        const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.scope_reveal_rect(this.__wbg_ptr, x0, y0, x1, y1, ptr0, len0);
        return ret >>> 0;
    }
    /**
     * Trace a river downhill through a field, as a flat [x0,y0,x1,y1,…] point array.
     * @param {string} field
     * @param {number} steps
     * @returns {string}
     */
    river_json(field, steps) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(field, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.scope_river_json(this.__wbg_ptr, ptr0, len0, steps);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    root() {
        const ret = wasm.scope_root(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The pathfound curve of a laid route edge, flat [x0,y0,x1,y1,…] in the
     * routing scope's local coords. Empty if the edge was laid straight.
     * @param {number} a
     * @param {number} b
     * @returns {string}
     */
    route_path_json(a, b) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.scope_route_path_json(this.__wbg_ptr, a, b);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Sample a named continuous field (e.g. "elevation") at a unit-space point.
     * The terrain the layered world is built on — the renderer shades the map with it.
     * @param {string} name
     * @param {number} x
     * @param {number} y
     * @returns {number}
     */
    sample_field(name, x, y) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.scope_sample_field(this.__wbg_ptr, ptr0, len0, x, y);
        return ret;
    }
    /**
     * BATCH field sampling — one WASM crossing for a whole grid. Per-call
     * `sample_field` pays a JS→WASM hop + field-name string encode PER SAMPLE;
     * a renderer lattice is 50k+ samples, so the postage dwarfed the letters
     * (this was the "slow as dirt" bake). Samples row-major at
     * (x0 + i*dx, y0 + j*dy) for nx×ny points, looped natively. Returns the
     * values as one Float32Array.
     * @param {string} name
     * @param {number} x0
     * @param {number} y0
     * @param {number} dx
     * @param {number} dy
     * @param {number} nx
     * @param {number} ny
     * @returns {Float32Array}
     */
    sample_field_grid(name, x0, y0, dx, dy, nx, ny) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.scope_sample_field_grid(this.__wbg_ptr, ptr0, len0, x0, y0, dx, dy, nx, ny);
        var v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
    /**
     * Poke a stat (god-mode / player input at any scale).
     * @param {number} id
     * @param {string} key
     * @param {number} v
     */
    set(id, key, v) {
        const ptr0 = passStringToWasm0(key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.scope_set(this.__wbg_ptr, id, ptr0, len0, v);
    }
    /**
     * Force an entity's next action (player intent override).
     * @param {number} id
     * @param {string} action
     */
    set_intent(id, action) {
        const ptr0 = passStringToWasm0(action, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.scope_set_intent(this.__wbg_ptr, id, ptr0, len0);
    }
    /**
     * The whole observed world as JSON — the one call the UI polls each frame.
     * @returns {string}
     */
    snapshot_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.scope_snapshot_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * WINDOWED snapshot — the TILE WORLD's memory law for the HOST side. The full
     * snapshot grows with every tile ever visited (serialize + parse cost grows
     * forever → the long-walk freeze). This variant ships ONLY entities whose
     * TILE (root-child ancestor) intersects the rect — the camera window + a
     * margin. Distant countries stay materialized in the ENGINE (canon intact,
     * folded dormant) but stop crossing the wire. Edges ship when both ends do.
     * @param {number} x0
     * @param {number} y0
     * @param {number} x1
     * @param {number} y1
     * @returns {string}
     */
    snapshot_rect_json(x0, y0, x1, y1) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.scope_snapshot_rect_json(this.__wbg_ptr, x0, y0, x1, y1);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Advance one tick.
     */
    step() {
        wasm.scope_step(this.__wbg_ptr);
    }
    /**
     * Advance `n` ticks.
     * @param {number} n
     */
    steps(n) {
        wasm.scope_steps(this.__wbg_ptr, n);
    }
    /**
     * @returns {bigint}
     */
    tick() {
        const ret = wasm.scope_tick(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
}
if (Symbol.dispose) Scope.prototype[Symbol.dispose] = Scope.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_344f42d3211c4765: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./owos_wasm_bg.js": import0,
    };
}

const ScopeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_scope_free(ptr, 1));

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('owos_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };

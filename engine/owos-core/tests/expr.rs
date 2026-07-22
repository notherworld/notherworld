//! Unit tests for the formula DSL — the layer every authored world stands on.
//! Add a case here whenever a formula behaves surprisingly: the test is the
//! documentation of what the DSL promises.

use owos_core::engine::World;

/// Evaluate a formula in a minimal world: one parent, one child entity of kind
/// "t" with the given stats. Returns the child's "out" stat after one tick.
fn eval(formula: &str, stats: &[(&str, f32)]) -> f32 {
    let mut w = World::new(1);
    let root = w.root;
    let id = w.spawn("t", "t", root);
    for (k, v) in stats {
        w.set(id, k, *v);
    }
    w.add_rule("t", "out", formula).expect("formula must parse");
    w.step();
    w.stat(id, "out")
}

#[test]
fn precedence_and_arithmetic() {
    assert_eq!(eval("2 + 3 * 4", &[]), 14.0);
    assert_eq!(eval("(2 + 3) * 4", &[]), 20.0);
    assert_eq!(eval("10 / 4", &[]), 2.5);
    assert_eq!(eval("7 - 2 - 1", &[]), 4.0); // left-assoc
}

#[test]
fn idents_read_own_stats() {
    assert_eq!(eval("a + b", &[("a", 2.0), ("b", 5.0)]), 7.0);
    // an unset stat reads as 0, never an error — worlds rely on this
    assert_eq!(eval("a + missing", &[("a", 2.0)]), 2.0);
}

#[test]
fn comparison_and_gate_functions() {
    assert_eq!(eval("gt(3, 2)", &[]), 1.0);
    assert_eq!(eval("gt(2, 3)", &[]), 0.0);
    assert_eq!(eval("iff(gt(x, 0.5), 10, 20)", &[("x", 0.9)]), 10.0);
    assert_eq!(eval("iff(gt(x, 0.5), 10, 20)", &[("x", 0.1)]), 20.0);
    assert_eq!(eval("clamp(5, 0, 1)", &[]), 1.0);
    assert_eq!(eval("min(3, 7) + max(3, 7)", &[]), 10.0);
}

#[test]
fn geometry_is_deterministic_everywhere() {
    // trig routes through libm: these exact values must hold on every platform
    // (Windows, Linux, macOS, WASM). If this fails on one platform only, a
    // platform math library leaked back in.
    let s = eval("sin(1)", &[]);
    let c = eval("cos(1)", &[]);
    assert_eq!(s.to_bits(), 0.84147096_f32.to_bits());
    assert_eq!(c.to_bits(), 0.5403023_f32.to_bits());
    assert_eq!(eval("sqrt(9)", &[]), 3.0);
    assert_eq!(eval("mod(7, 3)", &[]), 1.0);
    assert_eq!(eval("mod(0-1, 3)", &[]), 2.0); // euclidean-style wrap, not C-style
}

#[test]
fn rand_is_deterministic_per_entity_and_tick() {
    // same world, same tick, same entity → same roll; the roll CHANGES across
    // ticks (it's a stream, not a constant)
    let mut w = World::new(7);
    let root = w.root;
    let id = w.spawn("t", "t", root);
    w.add_rule("t", "out", "rand(1)").unwrap();
    w.step();
    let t1 = w.stat(id, "out");
    w.step();
    let t2 = w.stat(id, "out");
    assert_ne!(t1, t2, "rand should vary across ticks");

    // an identical world replays the identical stream
    let mut w2 = World::new(7);
    let root2 = w2.root;
    let id2 = w2.spawn("t", "t", root2);
    w2.add_rule("t", "out", "rand(1)").unwrap();
    w2.step();
    assert_eq!(w2.stat(id2, "out"), t1, "same seed must replay the same roll");
}

#[test]
fn parse_errors_are_errors_not_panics() {
    let mut w = World::new(1);
    assert!(w.add_rule("t", "out", "1 + : 2").is_err());
    assert!(w.add_rule("t", "out", "gt(1").is_err());
    assert!(w.add_rule("t", "out", "1 2 3").is_err()); // trailing tokens
}

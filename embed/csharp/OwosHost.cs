using System;
using System.Runtime.InteropServices;

// A FOREIGN-RUNTIME HOST for otherworldOS: C# / .NET driving the compiled
// owos_ffi.dll through its flat C ABI via P/Invoke. This is EXACTLY how Unity
// embeds a native plugin ([DllImport] -> the OS loader -> the cdylib). It never
// touches a Rust type — only the opaque world handle and the extern "C" functions
// declared in owos.h. If a managed runtime can drive this ABI, then C++ (Unreal)
// and GDExtension (Godot), which #include owos.h directly, are strictly easier.
public static class OwosHost
{
    const string LIB = "owos_ffi.dll";

    [DllImport(LIB)] static extern IntPtr owos_new_demo(ulong seed);
    [DllImport(LIB)] static extern void   owos_free(IntPtr w);
    [DllImport(LIB)] static extern void   owos_step(IntPtr w);
    [DllImport(LIB)] static extern uint   owos_root(IntPtr w);
    [DllImport(LIB)] static extern uint   owos_child(IntPtr w, uint id, uint index);
    [DllImport(LIB, CharSet = CharSet.Ansi)] static extern float owos_get(IntPtr w, uint id, string key);
    [DllImport(LIB, CharSet = CharSet.Ansi)] static extern void  owos_act_set(IntPtr w, uint id, string key, float v);
    [DllImport(LIB)] static extern IntPtr owos_name(IntPtr w, uint id);
    [DllImport(LIB)] static extern void   owos_fold(IntPtr w, uint id);
    [DllImport(LIB)] static extern void   owos_free_string(IntPtr s);

    // owos_name returns an owned C string the caller must free with owos_free_string.
    static string Name(IntPtr w, uint id) {
        IntPtr p = owos_name(w, id);
        string s = Marshal.PtrToStringAnsi(p);
        owos_free_string(p);
        return s;
    }

    public static void Run() {
        Console.WriteLine("(C# host) P/Invoke into owos_ffi.dll — Unity's exact native-plugin mechanism\n");

        // The host creates a living world through the plugin — same contract as owos.h.
        IntPtr w = owos_new_demo(1);
        uint root = owos_root(w);
        uint nation0 = owos_child(w, root, 0);

        for (int i = 0; i < 8; i++) owos_step(w);           // the host's frame loop
        Console.WriteLine("(C# host) after 8 steps · tension = " + owos_get(w, root, "tension").ToString("0.00"));

        // Player did something -> forward it as an action at the nation scale.
        owos_act_set(w, nation0, "at_war", 1.0f);
        Console.WriteLine("(C# host) player action forwarded: " + Name(w, nation0) + " declares war");

        for (int i = 0; i < 14; i++) owos_step(w);
        Console.WriteLine("(C# host) tension now = " + owos_get(w, root, "tension").ToString("0.00") + "  (propagated down to citizens and back up to the world)");

        // Read an individual leaf entity back out, to render it.
        uint city = owos_child(w, nation0, 0);
        uint citizen = owos_child(w, city, 0);
        Console.WriteLine("(C# host) reading a leaf to render: " + Name(w, citizen) + " · discontent = " + owos_get(w, citizen, "discontent").ToString("0.00"));

        // Zoom out (fold) a peaceful nation — the host stops rendering its detail.
        uint nation1 = owos_child(w, root, 1);
        owos_fold(w, nation1);
        Console.WriteLine("(C# host) folded " + Name(w, nation1) + " (offscreen) — it keeps running coarse for near-zero cost");

        owos_free(w);
        Console.WriteLine("\n(C# host) freed the world. This is the ENTIRE integration surface — identical calls from Unreal/Godot.");
    }
}

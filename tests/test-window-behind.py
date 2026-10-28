"""Window that opens *behind* the current foreground window.

Used to check that dsh-screenshoot captures a window by pid without bringing it
to the front: the window is shown without activation and pushed to the bottom of
the z-order.
"""
import ctypes
import os
import tkinter as tk

SW_SHOWNOACTIVATE = 4
HWND_BOTTOM = 1
SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_NOACTIVATE = 0x0010

root = tk.Tk()
root.title("DSH Background App")
width, height = 640, 420
screen_w, screen_h = root.winfo_screenwidth(), root.winfo_screenheight()
x = (screen_w - width) // 2
y = (screen_h - height) // 2
root.geometry(f"{width}x{height}+{x}+{y}")
root.configure(bg="#0f1720")

frame = tk.Frame(root, bg="#0f1720")
frame.pack(fill="both", expand=True)

tk.Label(frame, text="BACKGROUND WINDOW", font=("Segoe UI", 20, "bold"), fg="#f5f5f5", bg="#0f1720").pack(pady=(26, 6))
tk.Label(frame, text="opened without activation, pushed to the bottom", font=("Segoe UI", 11), fg="#93a1b1", bg="#0f1720").pack()
tk.Label(frame, text=f"pid {os.getpid()}", font=("Consolas", 11), fg="#93a1b1", bg="#0f1720").pack(pady=10)

canvas = tk.Canvas(frame, width=520, height=180, bg="#16232f", highlightthickness=0)
canvas.pack(pady=8)
for index, color in enumerate(["#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#8e7dff"]):
    canvas.create_rectangle(18 + index * 96, 24, 18 + index * 96 + 78, 132, fill=color, outline="")
canvas.create_text(260, 156, text="captured while in the background", fill="#c9d4e0", font=("Segoe UI", 11))

root.update_idletasks()
root.update()
# wm_frame() is the toplevel HWND (winfo_id() is the child frame).
handle = int(root.wm_frame(), 16)
ctypes.windll.user32.ShowWindow(handle, SW_SHOWNOACTIVATE)
ctypes.windll.user32.SetWindowPos(handle, HWND_BOTTOM, 0, 0, 0, 0,
                                  SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)

root.mainloop()

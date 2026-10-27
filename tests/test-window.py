"""Small always-visible window for the hsb-screenshoot capture test.

Opens a 700x460 window in the centre of the primary monitor and stays there,
drawing a recognisable pattern so the screenshot is easy to verify.
"""
import tkinter as tk

root = tk.Tk()
root.title("HSB Capture Test")
width, height = 700, 460
screen_w, screen_h = root.winfo_screenwidth(), root.winfo_screenheight()
x = (screen_w - width) // 2
y = (screen_h - height) // 2
root.geometry(f"{width}x{height}+{x}+{y}")
root.configure(bg="#101820")

header = tk.Label(root, text="HSB Capture Test", font=("Segoe UI", 22, "bold"), fg="#f2f2f2", bg="#101820")
header.pack(pady=(28, 6))

hint = tk.Label(root, text="this window is captured by pid", font=("Segoe UI", 12), fg="#9aa4b2", bg="#101820")
hint.pack(pady=(0, 18))

canvas = tk.Canvas(root, width=560, height=220, bg="#1b2733", highlightthickness=0)
canvas.pack()
colors = ["#f94144", "#f3722c", "#f9c74f", "#90be6d", "#43aa8b", "#577590"]
for index, color in enumerate(colors):
    canvas.create_rectangle(20 + index * 88, 30, 20 + index * 88 + 70, 150, fill=color, outline="")
canvas.create_text(280, 190, text="screenshot target", fill="#dfe6ee", font=("Segoe UI", 12))

footer = tk.Label(root, text=f"pid {__import__('os').getpid()}", font=("Consolas", 11), fg="#7f8c9b", bg="#101820")
footer.pack(pady=14)

root.mainloop()

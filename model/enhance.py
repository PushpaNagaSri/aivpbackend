import os
import sys
import cv2
import numpy as np
import tensorflow as tf
import io

# Force UTF-8 output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

if len(sys.argv) < 3:
    print("Usage: python enhance.py <input_video> <output_temp_avi>")
    sys.exit(1)

input_path = sys.argv[1]
output_temp_avi = sys.argv[2]

print("🎞️ Input video:", input_path)

# Load FSRCNN model

model_path = os.path.join(os.path.dirname(__file__), "fsrcnn_x4.pb")
print("📦 Loading FSRCNN model:", model_path)

with tf.io.gfile.GFile(model_path, "rb") as f:
    graph_def = tf.compat.v1.GraphDef()
    graph_def.ParseFromString(f.read())

tf.compat.v1.reset_default_graph()
tf.import_graph_def(graph_def, name="")
graph = tf.compat.v1.get_default_graph()

input_tensor = graph.get_tensor_by_name("IteratorGetNext:0")
output_tensor = graph.get_tensor_by_name("NHWC_output:0")

print("✅ FSRCNN model loaded.")

# PSNR Calculation

def calculate_psnr(original, enhanced):
    original = original.astype(np.float32)
    enhanced = enhanced.astype(np.float32)

    if original.shape != enhanced.shape:
        enhanced = cv2.resize(enhanced, (original.shape[1], original.shape[0]))

    mse = np.mean((original - enhanced) ** 2)
    if mse == 0:
        return 100.0
    PIXEL_MAX = 255.0
    return 20 * np.log10(PIXEL_MAX / np.sqrt(mse))


cap = cv2.VideoCapture(input_path)
if not cap.isOpened():
    print("❌ Failed to open video")
    sys.exit(1)

fps = cap.get(cv2.CAP_PROP_FPS)
fourcc = cv2.VideoWriter_fourcc(*"MJPG")
out = None

psnr_values = []


def smart_sharpen(img):
    blur = cv2.GaussianBlur(img, (0, 0), 2)
    sharpened = cv2.addWeighted(img, 1.8, blur, -0.8, 0)
    gray = cv2.cvtColor(sharpened, cv2.COLOR_BGR2GRAY)
    contrast = cv2.addWeighted(sharpened, 1.2, cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR), -0.2, 0)
    return np.clip(contrast, 0, 255).astype(np.uint8)

# FSRCNN Enhance Loop

frame_count = 0

with tf.compat.v1.Session(graph=graph) as sess:
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        original_frame = frame.copy()

        frame = smart_sharpen(frame)

        img = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
        y, cr, cb = cv2.split(img)
        y = y / 255.0
        y = np.expand_dims(np.expand_dims(y.astype(np.float32), axis=0), axis=-1)

        output_y = sess.run(output_tensor, feed_dict={"IteratorGetNext:0": y})
        output_y = np.squeeze(output_y)
        output_y = (output_y * 255).clip(0, 255).astype(np.uint8)

        output_ycrcb = cv2.merge([
            output_y,
            cv2.resize(cr, (output_y.shape[1], output_y.shape[0])),
            cv2.resize(cb, (output_y.shape[1], output_y.shape[0]))
        ])
        output_bgr = cv2.cvtColor(output_ycrcb, cv2.COLOR_YCrCb2BGR)

        output_bgr = smart_sharpen(output_bgr)

        if out is None:
            h, w = output_bgr.shape[:2]
            out = cv2.VideoWriter(output_temp_avi, fourcc, fps, (w, h))

        original_resized = cv2.resize(original_frame, (w, h))
        psnr_val = calculate_psnr(original_resized, output_bgr)
        psnr_values.append(psnr_val)

        # Draw PSNR on video
        text = f"PSNR: {psnr_val:.2f} dB"
        cv2.putText(output_bgr, text, (10, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)

        out.write(output_bgr)
        frame_count += 1

cap.release()
if out:
    out.release()

psnr_file = os.path.join(os.path.dirname(__file__), "psnr.txt")

if len(psnr_values) > 0:
    avg_psnr = sum(psnr_values) / len(psnr_values)
    with open(psnr_file, "w") as f:
        f.write(f"{avg_psnr:.2f}")
    print("📊 Average PSNR:", avg_psnr)
else:
    with open(psnr_file, "w") as f:
        f.write("0")
    print("⚠ No PSNR values calculated")

print("📁 Output saved to:", output_temp_avi)

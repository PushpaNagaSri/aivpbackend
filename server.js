import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
app.use(cors());
app.use(express.json());

// Paths fix for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = path.join(__dirname, "uploads");
const outputsDir = path.join(__dirname, "outputs");
const tempDir = path.join(__dirname, "temp");
const modelDir = path.join(__dirname, "model");

[uploadsDir, outputsDir, tempDir].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

app.use("/uploads", express.static(uploadsDir));
app.use("/outputs", express.static(outputsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `input_${unique}${ext}`);
  },
});

const upload = multer({ storage });

// Convert .avi → .mp4
function convertToMP4(tempAviPath, finalMp4Path) {
  return new Promise((resolve, reject) => {
    ffmpeg(tempAviPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions("-pix_fmt", "yuv420p")
      .on("end", resolve)
      .on("error", reject)
      .save(finalMp4Path);
  });
}

// Upload handler
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const inputPath = req.file.path;
    const unique = Date.now();
    const tempAviPath = path.join(tempDir, `temp_${unique}.avi`);
    const finalMp4Path = path.join(outputsDir, `enhanced_${unique}.mp4`);
    const pythonScript = path.join(modelDir, "enhance.py");
    const psnrFile = path.join(modelDir, "psnr.txt");

    if (!fs.existsSync(pythonScript)) {
      return res.status(500).json({ error: "enhance.py missing" });
    }

    // Remove previous psnr.txt
    if (fs.existsSync(psnrFile)) fs.unlinkSync(psnrFile);

    console.log("Running Python enhance.py...");

    const py = spawn("python", [pythonScript, inputPath, tempAviPath]);

    py.stdout.on("data", (d) => console.log("[PY]", d.toString()));
    py.stderr.on("data", (d) => console.error("[PY-ERR]", d.toString()));

    await new Promise((resolve) => py.on("close", resolve));

    if (!fs.existsSync(tempAviPath)) {
      return res.status(500).json({ error: "Enhancement failed" });
    }

    await convertToMP4(tempAviPath, finalMp4Path);

    let psnrValue = "0";
    if (fs.existsSync(psnrFile)) {
      psnrValue = fs.readFileSync(psnrFile, "utf8").trim();
    }

    const host = `${req.protocol}://${req.get("host")}`;
    const previewUrl = `${host}/outputs/${path.basename(finalMp4Path)}`;
    const downloadUrl = `${host}/outputs/${path.basename(finalMp4Path)}`;

    return res.json({
      previewUrl,
      downloadUrl,
      psnr: psnrValue,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

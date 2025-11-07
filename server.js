// import express from "express";
// import cors from "cors";
// import multer from "multer";
// import fs from "fs";
// import path from "path";
// import { fileURLToPath } from "url";
// import { spawn } from "child_process";
// import ffmpeg from "fluent-ffmpeg";
// import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

// ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// const app = express();
// app.use(cors());
// app.use(express.json());

// // Fix __dirname
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Directories
// const uploadsDir = path.join(__dirname, "uploads");
// const outputsDir = path.join(__dirname, "outputs");
// const tempDir = path.join(__dirname, "temp");

// // ✅ Multer setup - FIXED
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, uploadsDir);
//   },
//   filename: (req, file, cb) => {
//     const unique = Date.now();
//     const ext = path.extname(file.originalname);
//     cb(null, `input_${unique}${ext}`);
//   },
// });

// const upload = multer({ 
//   storage,
//   limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
// });

// // Static
// app.use("/uploads", express.static(uploadsDir));
// app.use("/outputs", express.static(outputsDir));

// // ✅ FFmpeg conversion
// function convertToMP4(tempAviPath, finalMp4Path, res, inputPath) {
//   console.log(`🎬 Converting: ${tempAviPath} -> ${finalMp4Path}`);

//   ffmpeg(tempAviPath)
//     .videoCodec("libx264")
//     .audioCodec("aac")
//     .outputOptions("-pix_fmt yuv420p")
//     .on("end", () => {
//       console.log("✅ FFmpeg conversion complete.");
      
//       // Delete temp files
//       fs.unlink(tempAviPath, () => {});
//       fs.unlink(inputPath, () => {
//         console.log("🗑️ Deleted uploaded file from uploads folder");
//       });

//       const previewUrl = `http://localhost:5000/outputs/${path.basename(finalMp4Path)}`;
//       const downloadUrl = `http://localhost:5000/download/${path.basename(finalMp4Path)}`;

//       res.json({ previewUrl, downloadUrl });
//     })
//     .on("error", (err) => {
//       console.error("❌ FFmpeg failed:", err.message);
//       fs.unlink(tempAviPath, () => {});
//       fs.unlink(inputPath, () => {});
//       res.status(500).json({ error: "FFmpeg failed" });
//     })
//     .save(finalMp4Path);
// }

// // ✅ Upload Route - WITH VERIFICATION
// app.post("/upload", upload.single("file"), (req, res) => {
//   console.log("📤 Upload received!");

//   if (!req.file) {
//     console.log("❌ No file uploaded");
//     return res.status(400).json({ error: "No file uploaded" });
//   }

//   const inputPath = req.file.path;
  
//   // ✅ VERIFY FILE IS SAVED
//   console.log("📁 Uploaded file saved at:", inputPath);
//   console.log("✅ File exists in uploads:", fs.existsSync(inputPath));
//   console.log("📊 File size:", (req.file.size / (1024 * 1024)).toFixed(2), "MB");

//   const timestamp = Date.now();
//   const tempAviPath = path.join(tempDir, `temp_${timestamp}.avi`);
//   const finalMp4Path = path.join(outputsDir, `enhanced_${timestamp}.mp4`);
//   const python = path.join(__dirname, "model", "enhance.py");

//   console.log("🐍 Running Python enhancement...");

//   const py = spawn("python", [python, inputPath, tempAviPath]);

//   py.stdout.on("data", (d) => console.log("[PY]", d.toString()));
//   py.stderr.on("data", (d) => console.error("[PY-ERR]", d.toString()));

//   py.on("close", (code) => {
//     console.log("Python closed with code", code);

//     if (!fs.existsSync(tempAviPath)) {
//       fs.unlink(inputPath, () => {});
//       return res.status(500).json({ error: "Enhancement failed" });
//     }

//     console.log("✅ Enhancement done → converting to MP4...");
//     convertToMP4(tempAviPath, finalMp4Path, res, inputPath);
//   });
// });

// // ✅ Download route
// app.get("/download/:filename", (req, res) => {
//   const file = path.join(outputsDir, req.params.filename);
//   if (!fs.existsSync(file)) return res.status(404).send("File not found");
//   res.download(file);
// });

// // ✅ Start server
// app.listen(5000, () => {
//   console.log("✅ Server running at http://localhost:5000");
// });
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = path.join(__dirname, "uploads");
const outputsDir = path.join(__dirname, "outputs");
const tempDir = path.join(__dirname, "temp");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `input_${unique}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }
});

app.use("/uploads", express.static(uploadsDir));
app.use("/outputs", express.static(outputsDir));

function convertToMP4(tempAviPath, finalMp4Path, res, inputPath) {
  ffmpeg(tempAviPath)
    .videoCodec("libx264")
    .audioCodec("aac")
    .outputOptions("-pix_fmt yuv420p")
    .on("end", () => {
      fs.unlink(tempAviPath, () => {});
      fs.unlink(inputPath, () => {});

      const previewUrl = `http://localhost:5000/outputs/${path.basename(finalMp4Path)}`;
      const downloadUrl = `http://localhost:5000/download/${path.basename(finalMp4Path)}`;

      // ✅ Read PSNR
      const psnrFile = path.join(__dirname, "model", "psnr.txt");
      let psnrValue = null;
      if (fs.existsSync(psnrFile)) {
        psnrValue = fs.readFileSync(psnrFile, "utf8");
      }

      res.json({ previewUrl, downloadUrl, psnr: psnrValue });
    })
    .on("error", () => {
      fs.unlink(tempAviPath, () => {});
      fs.unlink(inputPath, () => {});
      res.status(500).json({ error: "FFmpeg failed" });
    })
    .save(finalMp4Path);
}

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const inputPath = req.file.path;
  const timestamp = Date.now();
  const tempAviPath = path.join(tempDir, `temp_${timestamp}.avi`);
  const finalMp4Path = path.join(outputsDir, `enhanced_${timestamp}.mp4`);
  const python = path.join(__dirname, "model", "enhance.py");

  const py = spawn("python", [python, inputPath, tempAviPath]);

  py.stdout.on("data", (d) => console.log("[PY]", d.toString()));
  py.stderr.on("data", (d) => console.error("[PY-ERR]", d.toString()));

  py.on("close", (code) => {
    if (!fs.existsSync(tempAviPath)) {
      fs.unlink(inputPath, () => {});
      return res.status(500).json({ error: "Enhancement failed" });
    }

    convertToMP4(tempAviPath, finalMp4Path, res, inputPath);
  });
});

app.get("/download/:filename", (req, res) => {
  const file = path.join(outputsDir, req.params.filename);
  if (!fs.existsSync(file)) return res.status(404).send("File not found");
  res.download(file);
});

app.listen(5000, () => console.log("✅ Server running at http://localhost:5000"));

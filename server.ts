import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API to sync photos from a Google Drive folder
  app.post("/api/sync-folder", async (req, res) => {
    const { folderUrl } = req.body;
    
    if (!folderUrl || !folderUrl.includes("drive.google.com")) {
      return res.status(400).json({ error: "Invalid Google Drive URL" });
    }

    try {
      // Fetch the folder page
      const response = await axios.get(folderUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.34 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.34'
        }
      });
      
      const html = response.data;
      
      // Improved regex to find Google Drive file IDs specifically within the data arrays
      // Google Drive folder data usually looks like: ["id","name","type",...]
      // We look for IDs that are followed by typical image extensions or are in the file list structure
      const ids = new Set<string>();
      
      // Pattern: ["ID","FILENAME",...
      // This is much more reliable than just searching for any string that looks like an ID
      const fileEntryRegex = /\["([a-zA-Z0-9_-]{28,45})","([^"]+)"/g;
      let match;
      while ((match = fileEntryRegex.exec(html)) !== null) {
        const id = match[1];
        const fileName = match[2].toLowerCase();
        
        // Only add if it looks like an image file
        const isImage = /\.(jpg|jpeg|png|webp|gif|bmp)$/.test(fileName);
        if (isImage) {
          ids.add(id);
        }
      }

      // Fallback: If no images found with filenames, try a slightly broader but still constrained search
      if (ids.size === 0) {
        // Look for IDs that are likely files (33 chars) and not part of common UI strings
        const broadRegex = /"([a-zA-Z0-9_-]{33})"/g;
        while ((match = broadRegex.exec(html)) !== null) {
          const id = match[1];
          if (!id.startsWith('drive') && !id.includes('http')) {
            ids.add(id);
          }
        }
      }

      const folderIdMatch = folderUrl.match(/\/folders\/([^\/\?]+)/);
      const folderId = folderIdMatch ? folderIdMatch[1] : null;

      const photos = Array.from(ids)
        .filter(id => id !== folderId)
        .map(id => ({
          id: id,
          url: `https://lh3.googleusercontent.com/u/0/d/${id}=w1600`,
          isVertical: false 
        }));

      res.json({ photos: photos.slice(0, 100) });
    } catch (error) {
      console.error("Error syncing folder:", error);
      res.status(500).json({ error: "Failed to sync folder. Make sure the folder is public." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists (used temporarily for GAS upload)
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  const GAS_URL = process.env.GOOGLE_GAS_URL;
  const GAS_TOKEN = process.env.GOOGLE_GAS_TOKEN;

  // API Routes
  app.get('/api/itineraries', async (req, res) => {
    try {
      if (!GAS_URL) {
        throw new Error('GOOGLE_GAS_URL is not configured in environment variables.');
      }

      const url = new URL(GAS_URL);
      url.searchParams.append('action', 'get');
      if (GAS_TOKEN) url.searchParams.append('token', GAS_TOKEN);
      
      const response = await fetch(url.toString(), {
        redirect: 'follow'
      });
      
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        // Handle GAS returning array directly or wrapped
        const itineraries = Array.isArray(data) ? data : (data.data || []);
        
        // Ensure imageUrls is an array (GAS might return comma-separated string)
        const formattedData = itineraries.map((item: any) => {
          const imageUrlStr = item.imageUrl || '';
          return {
            ...item,
            day: parseInt(item.day),
            startHour: parseInt(item.startHour),
            startMinute: parseInt(item.startMinute),
            endHour: parseInt(item.endHour),
            endMinute: parseInt(item.endMinute),
            imageUrls: Array.isArray(item.imageUrls) 
              ? item.imageUrls 
              : (imageUrlStr ? imageUrlStr.split(',').map((s: string) => s.trim()) : [])
          };
        });
        
        return res.json(formattedData);
      } else {
        const text = await response.text();
        console.error('GAS returned non-JSON response:', text.substring(0, 200));
        throw new Error('GAS returned HTML instead of JSON. Please check if GAS is deployed with "Who has access: Anyone".');
      }
    } catch (error) {
      console.error('Error fetching itineraries:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch itineraries' });
    }
  });

  app.post('/api/itineraries', async (req, res) => {
    try {
      if (!GAS_URL) throw new Error('GOOGLE_GAS_URL is not configured.');
      
      const data = req.body;
      const response = await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'save', data, token: GAS_TOKEN }),
        redirect: 'follow'
      });
      
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const result = await response.json();
        return res.json(result);
      } else {
        const text = await response.text();
        console.error('GAS returned non-JSON response on save. First 500 chars:', text.substring(0, 500));
        
        if (text.includes('goog-ms-login') || text.includes('Sign in')) {
          throw new Error('GAS 要求登入。請確認部署設定為「所有人 (Anyone)」皆可存取。');
        } else if (text.includes('Script error') || text.includes('指令碼發生錯誤')) {
          throw new Error('GAS 腳本執行錯誤。請檢查 GAS 編輯器中的「執行項」日誌。');
        }
        
        throw new Error('GAS 回傳了 HTML 而非 JSON。這通常是權限或網址設定錯誤。');
      }
    } catch (error) {
      console.error('Error saving itinerary:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save itinerary' });
    }
  });

  app.delete('/api/itineraries/:id', async (req, res) => {
    try {
      if (!GAS_URL) throw new Error('GOOGLE_GAS_URL is not configured.');
      
      const { id } = req.params;
      const response = await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'delete', id, token: GAS_TOKEN }),
        redirect: 'follow'
      });
      
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const result = await response.json();
        return res.json(result);
      } else {
        const text = await response.text();
        console.error('GAS returned non-JSON response on delete:', text.substring(0, 200));
        throw new Error('GAS returned HTML instead of JSON on delete.');
      }
    } catch (error) {
      console.error('Error deleting itinerary:', error);
      res.status(500).json({ error: 'Failed to delete itinerary' });
    }
  });

  // File Upload API
  app.post('/api/upload', upload.single('image'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!GAS_URL) throw new Error('GOOGLE_GAS_URL is not configured.');

      const fileBuffer = fs.readFileSync(req.file.path);
      const base64Data = fileBuffer.toString('base64');
      
      const response = await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'upload',
          token: GAS_TOKEN,
          fileName: req.file.filename,
          contentType: req.file.mimetype,
          base64Data: base64Data
        }),
        redirect: 'follow'
      });

      // Remove local file after reading
      fs.unlinkSync(req.file.path);

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const result = await response.json() as any;
        if (result.error) throw new Error(result.error);
        return res.json({ imageUrl: result.imageUrl });
      } else {
        const text = await response.text();
        console.error('GAS upload returned non-JSON:', text.substring(0, 500));
        throw new Error('GAS 上傳失敗，回傳了 HTML。請檢查 GAS 權限設定。');
      }
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Failed to upload image' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

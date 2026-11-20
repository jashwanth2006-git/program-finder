# Program Finder 🚀

**Program Finder** is a web application designed for computer science laboratories, universities, and technical educators. Administrators upload PDF lab manuals and question papers, and students can instantly look up any program by question number, viewing the extracted question title, complete source code, and actual execution outputs (images and text).

---

## ⚡ Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React
- **Syntax Highlighting**: Prism.js (C, C++, Java, Python, JavaScript, SQL, HTML)
- **PDF Extraction Engine**: `pdfjs-dist` (client-side text, structure & layout parsing, embedded image extraction)
- **OCR Engine**: `tesseract.js` (for scanned documents)
- **Backend & Database**: Supabase PostgreSQL (Single Table architecture)
- **Authentication**: Supabase Auth (Admin Role with Database-Level RLS verification)
- **Storage**: Supabase Storage (Single private bucket: `question-papers`)

---

## 🏗 Architecture & Security

### 1. Only Three Main Pages
1. **Home Page (`/`)**: Minimal search interface with dynamic PDF selection dropdown (populated from published documents only), question number input, syntax-highlighted code viewer, copy/download actions, and actual output images/text.
2. **Admin Dashboard (`/#admin`)**: Direct PDF upload with drag-and-drop, progress tracking, live extraction engine, review & edit modal, replace PDF, and publish toggle.
3. **Login Page (`/#login`)**: Secure Supabase Auth login with password toggle and RLS-backed admin validation.

### 2. Single Application Table
All documents and their extracted questions, codes, and outputs reside in **one** table:
- `pdf_documents` with columns:
  - `id` (UUID PRIMARY KEY)
  - `file_name` (TEXT)
  - `display_name` (TEXT)
  - `storage_path` (TEXT)
  - `file_size` (BIGINT)
  - `extracted_content` (JSONB)
  - `processing_status` (TEXT: `pending`, `processing`, `review_required`, `completed`, `error`)
  - `processing_error` (TEXT)
  - `is_published` (BOOLEAN)
  - `uploaded_by` (UUID REFERENCES auth.users)
  - `created_at` (TIMESTAMPTZ)
  - `updated_at` (TIMESTAMPTZ)

### 3. Single Private Storage Bucket
- `question-papers`: Stores original PDF files under `pdfs/{documentId}/...` and extracted execution output screenshots under `output-images/{documentId}/...`.
- Storage RLS ensures only authorized administrators can upload, replace, and delete files.

### 4. Admin Authorization
- Secured at the database policy level (`public.is_admin()`), checking `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`. Public users cannot grant themselves admin rights.

---

## 📋 Setup & Installation Instructions

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment Variables
Open or create `.env` in the project root:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-actual-anon-key
```

### Step 3: Run Database & Storage Setup in Supabase
1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor** -> **New query**.
3. Copy and paste the entire contents of [`supabase-schema.sql`](file:///c:/Users/jashwanth/Downloads/fraud/supabase-schema.sql).
4. Click **Run**. This will:
   - Create the `pdf_documents` table with RLS enabled.
   - Configure public and admin policies.
   - Create the private `question-papers` bucket.
   - Set up the storage RLS policies.

### Step 4: Create an Admin Account
1. In your Supabase Dashboard, go to **Authentication** -> **Users** -> **Add User** -> **Create User**.
2. Enter your desired admin email and password.
3. In the **SQL Editor**, grant that user the `admin` role by running:
```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'your-admin-email@domain.com';
```

### Step 5: Start Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🔍 How to Use

### Admin Workflow
1. Click **Admin Login** in the top navigation bar.
2. Sign in with your admin credentials.
3. In the **Admin Dashboard**, select or drag & drop a PDF file (e.g., `Python_Lab_Manual.pdf`).
4. Optionally adjust the Display Name.
5. Click **Upload & Extract Content**.
   - The file is uploaded to the private `question-papers` bucket.
   - `pdfjs-dist` parses text, question headers, source code, and outputs in real-time.
   - The Extraction Review editor opens automatically.
6. In the **Extraction Review** modal:
   - Verify question numbers and problem statements.
   - Inspect and edit code formatting or indentation if needed.
   - View extracted output text or output screenshots.
   - Click **Approve & Publish PDF**.

### Student / User Workflow
1. Open the **Home Page**.
2. Select any published question paper from the dynamic dropdown.
3. Enter a question number (supports formats: `1`, `1(a)`, `1(b)`, `2(a)`, `10(a)`).
4. Click **Search Program** or press **Enter**.
5. View:
   - Question Number and Title
   - Formatted Source Code with syntax highlighting
   - **Copy Code** and **Download Code** buttons
   - Actual Output image screenshot and/or text (only displayed if actual output was found in the PDF).

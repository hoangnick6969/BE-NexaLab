# NXBGD KHTN 8 crawler

Crawler Python độc lập cho collection KHTN 8 đã được bạn cho phép. Phần TypeScript ingest theo contract đã được loại khỏi tool này vì không giúp tải dữ liệu collection.

## Cài đặt

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r python\requirements.txt
```

## Chạy

```powershell
.venv\Scripts\python.exe python\taphuan_crawler.py `
  --detail-url "https://taphuan.nxbgd.vn/tap-huan/chi-tiet-sach/khoa-hoc-tu-nhien-8-940036243.940036243" `
  --out .\out `
  --authorization-file .\authorization.json
```

Output gồm `snapshots/`, `assets/page-*.png`, `normalized/sections.json` và `manifest.json`.

Crawler tải ảnh trang reader, lưu HTML snapshot và ghi `SLIDE_REF`/`VIDEO_REF` cho Google Slides, YouTube/Vimeo thay vì tải nguồn bên thứ ba. Đây là chủ ý để không biến link tham chiếu thành bản sao media.

Ảnh trang có thể ghép thành PDF/ebook ở bước riêng phía frontend/backend. Crawler không tự tái bản thành sách phát hành. Video chỉ là metadata/reference; khi hiển thị nên dùng URL player chính thức sau human review.

`--ocr` là tùy chọn. Nếu máy chưa có Tesseract, manifest ghi `OCR_UNAVAILABLE` và không tự bịa text.

Mọi run vẫn là `NEEDS_REVIEW`, `releaseEligible=false`, `published=false`. Public access không tự đồng nghĩa với quyền tái sử dụng.

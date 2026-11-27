# Claude Studio

Ứng dụng desktop (Electron) bọc **https://claude.ai** cho Fedora Linux (KDE Plasma, Wayland, laptop GPU lai NVIDIA + AMD), kèm một **mascot robot** dễ thương nằm nổi trên trang, đổi hình dạng theo mức *effort* — và đổi luôn effort thật của claude.ai — cùng theme **Starry Night** (bầu trời vẽ theo phong cách tranh Van Gogh, có chuyển động) với giao diện kính mờ, và **quick chat** ngay trên mascot (gõ chữ hoặc nói qua micro).

- Bạn đăng nhập bằng tài khoản Claude (Pro) của chính mình; phiên đăng nhập được lưu trong partition `persist:claude`.
- Chỉ là giao diện: **không** đọc cookie/token, **không** tự gửi tin nhắn, **không** chặn/sửa request mạng. App chỉ thao tác trên claude.ai khi bạn ra lệnh: chọn mức effort trên mascot (mở menu Effort), hoặc bấm gửi trong quick chat (điền vào ô chat của claude.ai rồi bấm nút Send của nó).
- Mascot là bot pixel cam kiểu cổ điển của Claude (vẽ bằng SVG pixel + CSS, không dùng ảnh). Nhân vật này thuộc Anthropic, nên app chỉ để dùng cá nhân. Animation chỉ dùng `transform`/`opacity` (nhảy theo khung kiểu pixel) nên vẫn mượt khi tắt GPU.
- Chạy được ở cả ba chế độ của claude.ai: **Chat**, **Cowork** và **Code**.

## 1. Cài đặt

```bash
sudo dnf install nodejs npm fuse fuse-libs
```

```bash
cd ~/Projects/My-Claude
npm install
```

`fuse`/`fuse-libs` chỉ cần để chạy bản AppImage.

## 2. Chạy

```bash
npm start
```

Các biến thể:

| Lệnh | Ý nghĩa |
|---|---|
| `npm start` | Mặc định: `--ozone-platform-hint=auto` (Wayland nếu có), bật IME Wayland |
| `npm run start:egl` | Thêm `--use-gl=egl` |
| `npm run start:nogpu` | Tắt tăng tốc phần cứng (`app.disableHardwareAcceleration()`) |
| `npm run start:x11` | Ép chạy X11/XWayland (`--ozone-platform=x11`) |
| `npm run start:debug` | In thêm lỗi console của trang và User-Agent ra terminal |

Cũng có thể dùng biến môi trường (tiện cho file `.desktop`):

```bash
CLAUDE_STUDIO_GL=egl npm start
```

```bash
CLAUDE_STUDIO_NO_GPU=1 npm start
```

```bash
CLAUDE_STUDIO_X11=1 npm start
```

Các biến khác: `CLAUDE_STUDIO_NO_IME=1` (tắt IME Wayland), `CLAUDE_STUDIO_DEBUG=1`, `CLAUDE_STUDIO_NO_SANDBOX=1` (chỉ dùng khi bất đắc dĩ, xem mục 6). Cờ Chromium bất kỳ cũng truyền được: `npm start -- --use-angle=vulkan`.

### Đóng gói AppImage + thêm vào menu

```bash
npm run dist
```

```bash
./install.sh
```

`install.sh` chép AppImage mới nhất trong `dist/` vào `~/.local/bin/` và tạo `~/.local/share/applications/claude-studio.desktop` (kèm icon). Chưa build AppImage thì nó tạo shortcut chạy thẳng từ mã nguồn. Tuỳ chọn: `./install.sh --source`, `./install.sh --uninstall`, hoặc thêm cờ mặc định: `CLAUDE_STUDIO_ARGS="--studio-no-gpu" ./install.sh`.

## 3. Đăng nhập — mẹo

- **Nên đăng nhập bằng email.** Google thường chặn đăng nhập trong trình duyệt nhúng ("trình duyệt này có thể không an toàn").
- Claude gửi email có **mã xác minh** và **liên kết**. Gõ mã vào app là đơn giản nhất.
- Nếu chỉ có liên kết: chuột phải vào liên kết trong email → *Sao chép liên kết*, quay lại Claude Studio và bấm **Ctrl+Alt+L** (menu *Tệp → Mở liên kết claude.ai từ clipboard*). Đừng bấm thẳng vì nó sẽ mở trong trình duyệt khác, không phải trong app.
- Gặp vòng lặp kiểm tra Cloudflare: thử **Ctrl+Shift+R** (tải lại bỏ cache), hoặc chạy với `--studio-x11`/`--studio-no-gpu`. App đã gửi User-Agent Chrome chuẩn (bỏ `Electron/…` và tên app).
- Đăng xuất / xoá phiên: xoá thư mục `~/.config/Claude Studio/Partitions/claude`.

## 4. Mascot & effort

- Mặc định ở góc phải dưới, **kéo** để di chuyển (vị trí lưu trong `localStorage`), **bấm** để chào. Mascot tự né khung nhập chat.
- Thanh **Low / Med / High / Extra / Max** (đúng 5 mức effort của claude.ai) đổi hình dạng mascot (biến hình ~0.8s) **và đổi effort thật**: app tự mở menu model → *Effort* của claude.ai, chọn mức tương ứng rồi đóng menu (menu được ẩn trong lúc đó). Nếu model đang chọn không có Effort, mascot sẽ báo.
  - **Low** — bot cam cổ điển, mắt đen, không hào quang.
  - **Medium** — mắt xanh, vòng hào quang pixel xanh "chạy" quanh người.
  - **High** — mắt trắng nheo lại, tóc siêu chiến binh pixel nhỏ, lửa pixel thấp, viền đen pixel, tia sét pixel.
  - **Extra** — tóc pixel lớn, lửa cao hơn, vầng sáng trắng, vòng sáng dưới chân, tia lửa vuông bay lên, to gấp 1.2.
  - **Max** — dạng siêu chiến binh đầy đủ: tóc vàng nhấp nháy, lửa pixel cao vượt đầu (3 khung hình lật như sprite), rung liên tục, tia sét và tia lửa xanh, to gấp 1.5. (claude.ai ghi chú Max tốn khoảng 3.5–5× usage.)
- Nút **–** thu gọn thành bong bóng nhỏ; bấm bong bóng để mở lại.
- Nút **⟳** bật/tắt chiều claude.ai → mascot (khi bạn đổi effort ngay trong claude.ai, mascot đổi theo). Chấm xanh = đã nhận diện được nút model của claude.ai. Chọn mức trên mascot thì luôn đổi effort thật, dù ⟳ bật hay tắt.
- Nút **💬** mở quick chat (xem dưới).
- Nút **✦** bật/tắt theme Starry Night (xem mục 5).

### Quick chat

Bấm 💬 (hoặc Ctrl+Shift+K) để mở một khung kính nhỏ phía trên mascot:

- **Gõ chữ** rồi Enter (Shift+Enter để xuống dòng). Tin nhắn được gửi **vào cuộc trò chuyện đang mở** bằng chính ô chat và nút Send của claude.ai; ở trang *New* thì tạo cuộc trò chuyện mới. Câu trả lời hiện dần trong khung, mascot nháy "đang nghĩ" trong lúc chờ. Nút ↗ cuộn tới câu trả lời trong khung chat chính.
- **Micro 🎙**: bấm để nói, bấm lần nữa để dừng. App dùng nút micro có sẵn của claude.ai: *Dictate* ở Chat/Cowork, nút *giữ để ghi âm* ở Code (quick chat tự giữ nút đó cho bạn trong lúc nói). Chữ hiện dần vào khung để bạn sửa trước khi gửi. Lần đầu Fedora/KDE có thể hỏi quyền micro.
- Ở chế độ **Code**, tin nhắn gửi từ quick chat sẽ bắt đầu một phiên Claude Code mới, giống như gõ vào ô *Describe a task*.
- Nếu ô chat chính đang có bản nháp, khi mở quick chat bản nháp được chép sang khung để không mất; gửi từ quick chat sẽ dùng nội dung trong khung.
- Esc để đóng.

Phím tắt (menu ẩn, bấm **Alt** để hiện):

| Phím | Việc |
|---|---|
| Ctrl+Shift+M | Ẩn / hiện mascot |
| Ctrl+Shift+J | Thu gọn / mở rộng |
| Ctrl+Alt+1…5 | Effort Low / Medium / High / Extra / Max |
| Ctrl+Shift+T | Bật / tắt theme Starry Night |
| Ctrl+Shift+K | Mở / đóng quick chat |
| Ctrl+Alt+L | Mở liên kết claude.ai đang có trong clipboard |
| Ctrl+Shift+I | DevTools |

## 5. Theme Starry Night

Nền là một bức tranh được **vẽ bằng code** mỗi lần mở app, theo phong cách *Đêm đầy sao* của Van Gogh (1889, tranh thuộc phạm vi công cộng): hàng nghìn nét cọ chạy theo dòng gió xoáy, đồi núi, ngôi làng với nhà thờ và cây bách phía trước. Các phần chuyển động:

- **Vòng xoáy** lớn hình chữ S xoay chậm và "thở".
- **Dải mây/gió** chảy dọc theo đường cong (nét cọ trôi).
- **Sao và trăng lưỡi liềm**: lõi sáng nhịp đập, các vòng hào quang bằng nét cọ xoay ngược chiều nhau.
- **Ánh sáng** ấm lướt chậm qua bầu trời, **cửa sổ** trong làng chập chờn, **cây bách** đung đưa.

Sidebar, khung chat, menu, hộp thoại thành kính mờ (`backdrop-filter`). Bật mặc định; tắt bằng nút ✦ hoặc Ctrl+Shift+T (lưu lại). Mỗi lần mở app (hoặc đổi kích thước cửa sổ) nét cọ được vẽ lại ngẫu nhiên nên tranh hơi khác nhau.

- Chỉ áp dụng khi claude.ai ở **chế độ tối** (Settings → Appearance → Dark). Ở chế độ sáng theme tự tắt để chữ không bị chìm.
- Bố cục (vị trí sao, trăng, vòng xoáy, đường chân đồi) và bảng màu nằm đầu [`overlay/theme.js`](overlay/theme.js); animation và độ kính mờ trong [`overlay/theme.css`](overlay/theme.css) (`--cs-glass-blur`, độ tối lớp phủ `--cs-veil`). Lưu rồi Ctrl+R.
- Máy chạy `start:nogpu` thấy giật: giảm `--cs-glass-blur` (ví dụ `8px`), hoặc tắt theme. Dải gió (SVG nét đứt chạy) là animation duy nhất phải vẽ lại mỗi khung hình; các phần khác chỉ dùng transform/opacity.

## 6. Sửa selector (đồng bộ effort)

`overlay/effort-sync.js` làm hai chiều: `MutationObserver` **đọc** nút model của claude.ai (nhãn kiểu `Model: Sonnet 5.5 High`) để đổi mascot, và khi bạn chọn mức trên mascot thì mở menu Effort của claude.ai để chọn theo. Selector nằm trong [`overlay/selectors.json`](overlay/selectors.json):

- `chatInput` — khung nhập chat (để mascot né).
- `effortSelectors` + `effortKeywords` — phần tử chứa mức effort và từ khoá ứng với từng mức.
- `effortApply` — cách đổi effort thật: `trigger` (nút model), `effortItemText` (chữ đầu của mục "Effort" trong menu), `levelText` (chữ đầu của từng lựa chọn). Đặt `"enabled": false` để mascot chỉ còn là trang trí.
- `modelSync` — dự phòng khi nút không hiện effort: đoán theo tên model (Opus/Fable → High, Sonnet → Medium, Haiku → Low). Đặt `"enabled": false` để tắt.

Cách cập nhật khi claude.ai đổi giao diện:

1. Mở DevTools (**Ctrl+Shift+I**), dùng công cụ chọn phần tử bấm vào nút effort/model của claude.ai.
2. Ghi lại thuộc tính ổn định (`data-testid`, `aria-label`…), thêm selector CSS vào đầu danh sách tương ứng.
3. Lưu file và bấm **Ctrl+R** trong app — file được đọc lại mỗi lần tải trang, không cần khởi động lại.

Selector sai sẽ bị bỏ qua lặng lẽ; nếu không tìm thấy gì, mascot vẫn đổi hình như bình thường. Muốn xem log đồng bộ (`effort-sync →`, `effort-apply …: ok`): `npm run start:debug`.

Cho người sửa code: `npm run start:debug -- --studio-devtools-port=9333` mở Chrome DevTools Protocol trên `127.0.0.1:9333` để soi DOM của claude.ai từ công cụ ngoài. Chỉ dùng khi cần, vì cổng này điều khiển được trang đang đăng nhập.

## 7. Khắc phục sự cố trên Fedora

**Lỗi sandbox khi `npm start`** (`The SUID sandbox helper binary was found, but is not configured correctly`):

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
```

```bash
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

Cần làm lại sau mỗi lần `npm install`/cập nhật Electron. Chỉ dùng `CLAUDE_STUDIO_NO_SANDBOX=1` như phương án cuối.

**AppImage không chạy** (`dlopen(): error loading libfuse.so.2`): cài `fuse fuse-libs` (mục 1). Hoặc chạy không cần FUSE:

```bash
./dist/Claude-Studio-0.1.0-x86_64.AppImage --appimage-extract-and-run
```

**Màn hình đen / nhấp nháy / crash GPU** (hay gặp với GPU lai NVIDIA + AMD trên Wayland), thử lần lượt:

1. `npm run start:egl`
2. `npm run start:nogpu` — mascot vẫn mượt vì chỉ dùng transform/opacity.
3. `npm run start:x11`

**Chọn GPU**: mặc định app chạy trên AMD 780M (iGPU, tiết kiệm pin; file `.desktop` đặt `PrefersNonDefaultGPU=false`). Muốn ép chạy trên RTX 4060:

```bash
switcherooctl launch npm start
```

**Không gõ được tiếng Việt (fcitx5/ibus)**: app đã bật `--enable-wayland-ime --wayland-text-input-version=3`. Trong *System Settings → Keyboard → Virtual Keyboard* của KDE hãy chọn Fcitx 5. Vẫn lỗi thì thử `npm run start:x11`.

**Cửa sổ không có viền / icon sai trên taskbar**: chạy `./install.sh` để có file `.desktop` với `StartupWMClass=claude-studio`.

**Mascot không hiện**: bấm Ctrl+Shift+M (có thể đang ẩn), hoặc menu *Mascot → Đặt lại vị trí*. Xem terminal: dòng `[renderer] [ClaudeStudio] mascot ready` cho biết overlay đã được chèn.

## Cấu trúc

```
main.js                 cửa sổ, cờ Fedora/Wayland, User-Agent, chèn overlay
overlay/bot.js          mascot (SVG), kéo thả, thu gọn, chọn effort
overlay/bot.css         các dạng Low/Medium/High/Max + animation
overlay/effort-sync.js  đồng bộ effort hai chiều với claude.ai
overlay/theme.js        theme Starry Night (vẽ tranh bằng canvas + các lớp chuyển động)
overlay/theme.css       animation bầu trời + kính mờ cho claude.ai
overlay/quick-chat.js   quick chat trên mascot (chữ + micro qua Dictate)
overlay/selectors.json  selector có thể sửa
assets/                 icon
claude-studio.desktop   mẫu shortcut (install.sh điền đường dẫn)
install.sh              cài shortcut vào ~/.local/share/applications
```

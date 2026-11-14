# SAI-01 hint review set — tutor-rules@1

Generated from `src/modules/labs/application/tutor-rules.ts` (template digest `28028f1cf0dfb87ccd03a2ec0b94f98acb4554d314aaad8ffc6f2a83e50b2180`). Every `(key, level, variant)` the student can receive.
`{minimumResistance}`, `{extent}` and `{limiting}` are filled from the engine result at run time (for example 350 Ω for a 9 V source).

**For the supervising lecturer (SAI1-T6).** Mark each row: *Khoa học* = Đ (đúng) / S (sai), *Lộ đáp án* = C (có) / K (không), add a note when wording should change. Accept when: 0 scientific errors and 0 answer leaks. Provider observations are not in this set: they need gate SG-2 (no real provider is configured).

## OPEN_CIRCUIT — Mạch điện: mạch hở

| # | Mức | Biến thể | Nội dung | Khoa học (Đ/S) | Lộ đáp án (C/K) | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 · Câu hỏi quan sát | a | Em có lần theo được một vòng dây kín từ nguồn rồi quay về nguồn không? |  |  |  |
| 2 | 1 · Câu hỏi quan sát | b | Bắt đầu từ một cực của nguồn, đi theo dây nối: em có quay lại được cực kia của nguồn không? |  |  |  |
| 3 | 2 · Gợi ý khái niệm | a | Dòng điện cần một đường dẫn khép kín. |  |  |  |
| 4 | 2 · Gợi ý khái niệm | b | Chỉ khi các linh kiện nối thành một vòng liền từ nguồn về nguồn thì mới có dòng điện. |  |  |  |
| 5 | 3 · Gợi ý thao tác | a | Thử nối các đầu còn rời thành một vòng chứa nguồn, LED và điện trở. |  |  |  |
| 6 | 3 · Gợi ý thao tác | b | Tìm đầu dây hoặc linh kiện còn chưa được nối, rồi nối chúng để khép vòng qua nguồn, LED và điện trở. |  |  |  |
| 7 | 4 · Giải thích | a | Mạch hở không có dòng điện. Hãy kiểm tra dây nối, sau đó chạy lại để engine xác nhận. |  |  |  |
| 8 | 4 · Giải thích | b | Engine không tìm thấy vòng kín nào đi qua nguồn, nên dòng điện bằng không. Khép kín mạch rồi chạy lại để kiểm tra. |  |  |  |

## SWITCH_OPEN — Mạch điện: công tắc mở

| # | Mức | Biến thể | Nội dung | Khoa học (Đ/S) | Lộ đáp án (C/K) | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| 9 | 1 · Câu hỏi quan sát | a | Công tắc hiện đang ở trạng thái nào? |  |  |  |
| 10 | 1 · Câu hỏi quan sát | b | Nhìn vào công tắc trên mạch: nó đang đóng hay mở? |  |  |  |
| 11 | 2 · Gợi ý khái niệm | a | Công tắc mở làm ngắt đường đi của dòng điện. |  |  |  |
| 12 | 2 · Gợi ý khái niệm | b | Một công tắc mở trên nhánh giống như một chỗ đứt dây. |  |  |  |
| 13 | 3 · Gợi ý thao tác | a | Thử đóng công tắc rồi chạy lại. |  |  |  |
| 14 | 3 · Gợi ý thao tác | b | Đóng công tắc nằm trên nhánh có LED, sau đó chạy lại mạch. |  |  |  |
| 15 | 4 · Giải thích | a | Mạch chỉ dẫn điện khi có đường khép kín và mọi công tắc trên nhánh đều đóng. |  |  |  |
| 16 | 4 · Giải thích | b | Engine thấy vòng dây đã kín nhưng có công tắc mở trên mọi nhánh, nên không có dòng điện. |  |  |  |

## LED_OVERLOAD — Mạch điện: LED quá dòng

| # | Mức | Biến thể | Nội dung | Khoa học (Đ/S) | Lộ đáp án (C/K) | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| 17 | 1 · Câu hỏi quan sát | a | Dòng điện engine trả về có vượt giới hạn 20 mA không? |  |  |  |
| 18 | 1 · Câu hỏi quan sát | b | So sánh dòng điện qua LED với giới hạn an toàn của LED trong mô hình: dòng đang lớn hơn hay nhỏ hơn? |  |  |  |
| 19 | 2 · Gợi ý khái niệm | a | Khi giữ nguyên điện áp, tăng điện trở sẽ làm dòng điện giảm. |  |  |  |
| 20 | 2 · Gợi ý khái niệm | b | Điện trở mắc nối tiếp với LED giúp hạn chế dòng điện đi qua LED. |  |  |  |
| 21 | 3 · Gợi ý thao tác | a | Thử thêm hoặc tăng điện trở trên nhánh LED rồi chạy lại. |  |  |  |
| 22 | 3 · Gợi ý thao tác | b | Trên nhánh có LED, hãy thêm một điện trở hoặc chọn điện trở lớn hơn, sau đó chạy lại. |  |  |  |
| 23 | 4 · Giải thích | a | Engine dùng I = (U − 2 V × số LED) / R. Với một LED, điện trở tối thiểu do engine tính là {minimumResistance} Ω. Nhánh không có điện trở được đánh dấu quá dòng, không gán dòng hữu hạn giả. |  |  |  |
| 24 | 4 · Giải thích | b | Theo engine, với một LED cần điện trở ít nhất {minimumResistance} Ω để dòng không vượt 20 mA, vì I = (U − 2 V × số LED) / R. Nhánh không có điện trở luôn bị coi là quá dòng. |  |  |  |

## NO_LED — Mạch điện: vòng kín không có LED

| # | Mức | Biến thể | Nội dung | Khoa học (Đ/S) | Lộ đáp án (C/K) | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| 25 | 1 · Câu hỏi quan sát | a | Trong vòng kín hiện có LED chưa? |  |  |  |
| 26 | 1 · Câu hỏi quan sát | b | Vòng dây kín của em đang đi qua những linh kiện nào? |  |  |  |
| 27 | 2 · Gợi ý khái niệm | a | Chỉ linh kiện nằm trên đường dẫn kín mới tham gia thí nghiệm. |  |  |  |
| 28 | 2 · Gợi ý khái niệm | b | Một LED đặt ngoài vòng kín sẽ không có dòng điện chạy qua. |  |  |  |
| 29 | 3 · Gợi ý thao tác | a | Thử đưa LED vào cùng vòng dây với nguồn và điện trở. |  |  |  |
| 30 | 3 · Gợi ý thao tác | b | Nối LED vào vòng kín, mắc nối tiếp với điện trở, rồi chạy lại. |  |  |  |
| 31 | 4 · Giải thích | a | Mục tiêu yêu cầu LED sáng. Vòng kín chỉ có điện trở chưa đáp ứng mục tiêu. |  |  |  |
| 32 | 4 · Giải thích | b | Engine thấy có vòng kín nhưng không có LED nào trong đó, nên mục tiêu làm LED sáng chưa được đáp ứng. |  |  |  |

## LOW_CURRENT — Mạch điện: dòng quá nhỏ

| # | Mức | Biến thể | Nội dung | Khoa học (Đ/S) | Lộ đáp án (C/K) | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| 33 | 1 · Câu hỏi quan sát | a | Điện áp nguồn và số LED có phù hợp với nhau không? |  |  |  |
| 34 | 1 · Câu hỏi quan sát | b | Mỗi LED cần một phần điện áp để sáng: nguồn của em có đủ cho số LED đang mắc không? |  |  |  |
| 35 | 2 · Gợi ý khái niệm | a | LED cần đủ điện áp thuận và dòng tối thiểu trong mô hình. |  |  |  |
| 36 | 2 · Gợi ý khái niệm | b | Nếu dòng điện quá nhỏ, LED không sáng dù mạch đã kín. |  |  |  |
| 37 | 3 · Gợi ý thao tác | a | Thử điều chỉnh điện áp hoặc giảm điện trở trong giới hạn an toàn. |  |  |  |
| 38 | 3 · Gợi ý thao tác | b | Thử bớt LED trên một nhánh, tăng điện áp nguồn hoặc giảm điện trở, nhưng vẫn giữ dòng dưới giới hạn an toàn. |  |  |  |
| 39 | 4 · Giải thích | a | Mô hình dùng sụt áp 2 V mỗi LED và ngưỡng sáng 1 mA. Engine đánh giá các ngưỡng này trên từng nhánh. |  |  |  |
| 40 | 4 · Giải thích | b | Trong mô hình, mỗi LED lấy 2 V và cần ít nhất 1 mA để sáng; engine kiểm tra hai ngưỡng này cho từng nhánh. |  |  |  |

## CHEMISTRY — Hoá học: phản ứng theo tỉ lệ mol

| # | Mức | Biến thể | Nội dung | Khoa học (Đ/S) | Lộ đáp án (C/K) | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| 41 | 1 · Câu hỏi quan sát | a | Em quan sát thấy chất nào còn dư? |  |  |  |
| 42 | 1 · Câu hỏi quan sát | b | Sau phản ứng, chất nào vẫn còn lại trong cốc? |  |  |  |
| 43 | 2 · Gợi ý khái niệm | a | Hệ số phương trình cho biết tỉ lệ số mol phản ứng. |  |  |  |
| 44 | 2 · Gợi ý khái niệm | b | Các chất phản ứng với nhau theo đúng tỉ lệ hệ số trong phương trình hoá học. |  |  |  |
| 45 | 3 · Gợi ý thao tác | a | Thử thay đổi lượng chất để tỉ lệ mol khớp hệ số phương trình. |  |  |  |
| 46 | 3 · Gợi ý thao tác | b | Điều chỉnh số mol của một chất sao cho tỉ lệ hai chất bằng tỉ lệ hệ số, rồi chạy lại. |  |  |  |
| 47 | 4 · Giải thích | a | Engine xác định mức tiến triển bằng min(nA/hệ số A, nB/hệ số B). Kết quả hiện tại: {extent} mol; chất giới hạn: {limiting}. |  |  |  |
| 48 | 4 · Giải thích | b | Chất hết trước quyết định lượng phản ứng: engine lấy giá trị nhỏ hơn của nA/hệ số A và nB/hệ số B, được {extent} mol; chất giới hạn là {limiting}. |  |  |  |

## CHEMISTRY_PH — Hoá học: nhận biết axit/bazơ bằng quỳ tím

| # | Mức | Biến thể | Nội dung | Khoa học (Đ/S) | Lộ đáp án (C/K) | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| 49 | 1 · Câu hỏi quan sát | a | Mỗi lọ làm quỳ tím đổi sang màu gì? |  |  |  |
| 50 | 1 · Câu hỏi quan sát | b | Em đã ghi lại màu của quỳ tím khi nhúng vào từng lọ chưa? |  |  |  |
| 51 | 2 · Gợi ý khái niệm | a | Quỳ tím hoá đỏ trong dung dịch axit, hoá xanh trong dung dịch bazơ và không đổi màu trong dung dịch trung tính. |  |  |  |
| 52 | 2 · Gợi ý khái niệm | b | Màu của quỳ tím cho biết dung dịch có tính axit, bazơ hay trung tính. |  |  |  |
| 53 | 3 · Gợi ý thao tác | a | Thử lại từng lọ, so màu quỳ tím với bảng màu rồi chọn tính chất cho lọ đó. |  |  |  |
| 54 | 3 · Gợi ý thao tác | b | Kiểm tra lại lọ mà em chưa chắc, đối chiếu màu quỳ tím rồi sửa lựa chọn của lọ đó. |  |  |  |
| 55 | 4 · Giải thích | a | Mỗi lọ chỉ có một tính chất; màu quỳ tím là bằng chứng để quyết định lọ đó là axit, bazơ hay trung tính. |  |  |  |
| 56 | 4 · Giải thích | b | Hãy dựa vào màu quỳ tím quan sát được, không đoán theo thứ tự lọ: mỗi màu ứng với đúng một loại dung dịch. |  |  |  |

## EYE — Sinh học: cấu tạo mắt

| # | Mức | Biến thể | Nội dung | Khoa học (Đ/S) | Lộ đáp án (C/K) | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| 57 | 1 · Câu hỏi quan sát | a | Bộ phận nào tiếp nhận ánh sáng trước tiên? |  |  |  |
| 58 | 1 · Câu hỏi quan sát | b | Khi ánh sáng đi vào mắt, nó gặp bộ phận nào đầu tiên? |  |  |  |
| 59 | 2 · Gợi ý khái niệm | a | Hãy liên hệ vị trí với chức năng của từng bộ phận. |  |  |  |
| 60 | 2 · Gợi ý khái niệm | b | Vị trí của mỗi bộ phận trên đường đi của ánh sáng gợi ý chức năng của nó. |  |  |  |
| 61 | 3 · Gợi ý thao tác | a | Mở chế độ khám phá và theo đường đi của ánh sáng, sau đó thử lại. |  |  |  |
| 62 | 3 · Gợi ý thao tác | b | Trong chế độ khám phá, bấm lần lượt từng bộ phận theo đường đi của ánh sáng rồi điền lại. |  |  |  |
| 63 | 4 · Giải thích | a | Ánh sáng đi qua giác mạc, thủy dịch, đồng tử, thể thủy tinh và dịch kính để đến võng mạc. |  |  |  |
| 64 | 4 · Giải thích | b | Đường đi của ánh sáng trong mắt: giác mạc, thủy dịch, đồng tử, thể thủy tinh, dịch kính rồi tới võng mạc. |  |  |  |

Total: 64 templates.

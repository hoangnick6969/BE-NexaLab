import type { Catalog, CriterionHints } from "./checkpoint-hint-rules";
import { buoyancyLabEvaluator } from "./evaluators/buoyancy-lab.evaluator";
import { densityStationsEvaluator } from "./evaluators/density-stations.evaluator";
import { eyeOpticsEvaluator } from "./evaluators/eye-anatomy-optics.evaluator";
import { geneProteinStationsEvaluator } from "./evaluators/gene-protein-stations.evaluator";

/**
 * SAI-01A step 2: after-submit hints for station Labs (FL-03, FL-27, FL-16, FL-05). Same ladder,
 * escalation and leak rules as the checkpoint catalogs; no in-run hints (these are not predict-observe).
 * Part of checkpoint-hints@3: change a text → bump CHECKPOINT_HINT_RULES and the pinned digest.
 */

const ANSWER_LETTER = /(?:[đĐ]áp án|[lL]ựa chọn|[pP]hương án|[cC]họn)\s+[ABC](?![\p{L}\p{N}])/u;
const hints = (label: string, levels: CriterionHints["levels"], forbidden: RegExp[] = []): CriterionHints =>
  ({ label, levels, forbidden: [ANSWER_LETTER, ...forbidden] });

/** "criterion:station" → criterion, except the stations listed in `keepStation`. */
const byCriterion = (keepStation: readonly string[]) => (unmet: string) => (keepStation.includes(unmet) ? unmet : unmet.split(":")[0] || null);

// FL-03 density stations (density-stations@1.0.0). Evidence: explore, block, water, pebble, units.
const DENSITY: Catalog = {
  order: ["balance", "ruler", "cylinder", "calculation", "unitConversion", "concept:explore", "concept:irregular"],
  keyOf: byCriterion(["concept:explore", "concept:irregular"]),
  answerOf: (evidence, key) => ({
    balance: [evidence?.explore, evidence?.block?.trials, evidence?.water?.m1G, evidence?.water?.m2G, evidence?.pebble?.massG],
    ruler: evidence?.block?.trials,
    cylinder: [evidence?.water?.volumeMl, evidence?.pebble?.v1Ml, evidence?.pebble?.v2Ml],
    calculation: [evidence?.block?.density, evidence?.water?.density, evidence?.pebble?.density],
    unitConversion: evidence?.units?.woodKgm3,
    "concept:explore": evidence?.explore?.conclusion,
    "concept:irregular": evidence?.units?.irregularReason,
  } as Record<string, unknown>)[key],
  criteria: {
    balance: hints("Đọc cân", [
      ["Em đã trừ khối lượng cốc hoặc đĩa cân chưa, và số em ghi có đúng với số hiện trên cân không?", "Trước khi đặt vật lên, cân đã chỉ số 0 chưa?"],
      ["Khối lượng của vật là số chỉ của cân khi chỉ có vật trên đĩa; khối lượng nước là hiệu giữa cốc có nước và cốc rỗng.", "Mỗi lần đọc cân phải ghi đủ chữ số mà cân hiển thị, đúng đơn vị gam."],
      ["Đo lại từng vật: đưa cân về 0, đặt vật, chờ số ổn định rồi mới ghi. Với nước, cân cốc rỗng trước rồi cân cốc có nước.", "Đọc lại từng lần cân trong bảng của em và so với số hiện trên màn hình cân khi đặt lại đúng vật đó."],
      ["Sai số ở bước cân thường do quên đưa cân về 0, đọc nhầm vật, hoặc tính khối lượng nước mà không trừ cốc. Kiểm tra lần lượt ba điều này cho từng trạm.", "Mỗi khối lượng trong bài phải là số đọc trực tiếp hoặc hiệu của hai số đọc. Xem lại từng ô và tự hỏi nó được đọc từ đâu."],
    ]),
    ruler: hints("Đo kích thước bằng thước", [
      ["Em đã đo đủ ba cạnh khác nhau của khối gỗ và đặt vạch 0 của thước đúng mép vật chưa?", "Số em ghi đang ở đơn vị nào: milimét hay xăngtimét?"],
      ["Đo độ dài phải đặt vạch 0 trùng một đầu vật và đọc vạch ở đầu kia, mắt nhìn vuông góc với thước.", "Một khối hộp có ba kích thước: dài, rộng, cao; mỗi kích thước cần một lần đo riêng."],
      ["Đo lại từng cạnh: dời thước sao cho vạch 0 trùng mép, đọc vạch ở mép đối diện và ghi bằng milimét.", "Xoay khối gỗ để đo từng cặp mặt đối diện, rồi đối chiếu ba số em ghi với ba cạnh thật."],
      ["Thể tích khối hộp bằng tích ba cạnh, nên một cạnh đọc sai cũng làm sai cả thể tích. Hãy đo lại cả ba cạnh với vạch 0 đặt đúng và cùng một đơn vị.", "Kiểm tra ba điều: vạch 0 đúng mép, đọc vuông góc, cùng đơn vị. Cạnh nào vi phạm một điều thì đo lại."],
    ]),
    cylinder: hints("Đọc ống đong", [
      ["Khi đọc ống đong, em đặt mắt ngang với đáy mặt cong của nước chưa?", "Em đã đọc mực nước trước và sau khi thả vật chưa?"],
      ["Thể tích chất lỏng đọc ở vạch ngang đáy mặt cong; thể tích vật rắn chìm bằng phần nước dâng lên.", "Một vạch chia trên ống đong ứng với một lượng thể tích cố định; hãy xem mỗi vạch là bao nhiêu mililít."],
      ["Đọc lại mực nước lúc chưa thả vật và lúc vật đã chìm hẳn, mỗi lần mắt ngang đáy mặt cong.", "Xác định giá trị một vạch chia trước, rồi đếm vạch từ mốc có số gần nhất."],
      ["Ống đong đo thể tích bằng mực nước. Thể tích vật không đều được tính bằng hiệu hai lần đọc: sau khi thả vật trừ trước khi thả vật. Hai lần đọc đều phải đúng cách đặt mắt.", "Kiểm tra cách đặt mắt, giá trị mỗi vạch chia và phép trừ giữa hai lần đọc; sai một trong ba điều là sai thể tích."],
    ]),
    calculation: hints("Tính khối lượng riêng", [
      ["Khối lượng riêng em tính được lấy khối lượng chia cho thể tích, hay ngược lại?", "Em đã dùng đúng số đo của chính mình để tính chưa?"],
      ["Khối lượng riêng bằng khối lượng chia cho thể tích của vật, với đơn vị tương ứng như g/cm³.", "Nếu đo nhiều lần, hãy lấy trung bình các lần đo trước khi chia."],
      ["Viết phép tính ra giấy: khối lượng trung bình ở trên, thể tích ở dưới, rồi ghi đơn vị kết quả.", "Đổi thể tích về cm³ trước khi chia nếu em đo bằng mm³ hoặc mL."],
      ["Khối lượng riêng là khối lượng của một đơn vị thể tích chất: lấy khối lượng chia cho thể tích, cả hai dùng đúng số em đã đo và cùng hệ đơn vị. Kiểm tra lại thứ tự phép chia và đơn vị.", "Kết quả phải là số đo của chính em sau phép chia đúng thứ tự. Xem lại từng trạm: khối lượng nào, thể tích nào, đơn vị gì."],
    ]),
    unitConversion: hints("Đổi đơn vị", [
      ["1 cm³ bằng bao nhiêu m³, và 1 g bằng bao nhiêu kg?", "Khi đổi từ g/cm³ sang kg/m³, con số lớn lên hay nhỏ đi?"],
      ["Đổi đơn vị khối lượng riêng phải đổi cả tử số (g sang kg) và mẫu số (cm³ sang m³).", "Một mét khối chứa rất nhiều xăngtimét khối, nên kg/m³ cho con số lớn hơn g/cm³."],
      ["Viết 1 g/cm³ thành phân số, đổi riêng g sang kg và cm³ sang m³, rồi rút gọn để tìm hệ số đổi.", "Áp dụng hệ số đổi em vừa tìm cho khối lượng riêng của khối gỗ."],
      ["Đổi đơn vị không làm thay đổi đại lượng, chỉ đổi con số đi kèm. Tìm hệ số giữa g/cm³ và kg/m³ bằng cách đổi riêng khối lượng và thể tích, rồi nhân với kết quả của em.", "Kiểm tra hệ số đổi bằng một ví dụ quen thuộc như nước, rồi mới áp dụng cho khối gỗ."],
    ]),
    "concept:explore": hints("Kết luận khi khám phá", [
      ["Các vật cùng một chất nhưng to nhỏ khác nhau thì tỉ số khối lượng trên thể tích của chúng có giống nhau không?", "Điều gì thay đổi và điều gì giữ nguyên khi em đổi kích thước của cùng một chất?"],
      ["Khối lượng riêng là đặc trưng của chất; nó cho biết khối lượng của một đơn vị thể tích chất đó.", "Hai vật làm từ cùng một chất có thể khác khối lượng nhưng vẫn có cùng tỉ số khối lượng trên thể tích."],
      ["Xem lại bảng khám phá: tính tỉ số khối lượng trên thể tích cho từng vật rồi so sánh.", "Nhóm các vật theo chất làm nên chúng, rồi so tỉ số trong từng nhóm."],
      ["Một kết luận đúng phải giải thích được số liệu khám phá: vật cùng chất có tỉ số khối lượng trên thể tích gần như bằng nhau dù kích thước khác nhau. Đối chiếu từng kết luận với nhận xét đó.", "Loại những kết luận mâu thuẫn với bảng số liệu em vừa đo."],
    ]),
    "concept:irregular": hints("Vật có hình dạng không đều", [
      ["Với hòn đá không có hình dạng đều, em có dùng thước để tính thể tích được không?", "Có cách nào đo thể tích của vật mà không cần đo các cạnh của nó?"],
      ["Thể tích vật rắn không thấm nước có thể đo bằng thể tích nước nó chiếm chỗ khi chìm hẳn.", "Phần nước dâng lên trong ống đong bằng thể tích phần vật chìm trong nước."],
      ["Xem lại trạm hòn đá: em đã dùng ống đong đo thể tích như thế nào?", "So cách đo thể tích khối gỗ và hòn đá: cách nào dùng được cho vật có hình dạng không đều?"],
      ["Vật có hình dạng không đều không đo được các cạnh, nên thể tích được đo gián tiếp qua lượng nước nó chiếm chỗ. Chọn lời giải thích nêu đúng lý do này.", "Một lý do đúng phải nói vì sao không dùng thước được và vì sao ống đong vẫn cho đúng thể tích."],
    ]),
  },
};

// FL-27 gene to protein (gene-protein-stations@1.0.0).
const GENE: Catalog = {
  order: ["structure", "replication", "transcription", "translation", "mutation", "concept:flow", "concept:geneRole"],
  keyOf: byCriterion(["concept:flow", "concept:geneRole"]),
  answerOf: (evidence, key) => (key.startsWith("concept:") ? evidence?.conclusion?.[key.slice("concept:".length)] : evidence?.[key]),
  criteria: {
    structure: hints("Cấu trúc ADN", [
      ["Trên mô hình, một vòng xoắn có bao nhiêu cặp nucleotide, và em đọc chiều dài, đường kính ở đâu?", "Các nucleotide trên hai mạch bắt cặp với nhau theo quy tắc nào?"],
      ["ADN gồm hai mạch xoắn quanh một trục; các bazơ trên hai mạch liên kết theo nguyên tắc bổ sung.", "Kích thước của chuỗi xoắn được đọc trực tiếp trên mô hình bằng thước đo đi kèm."],
      ["Dùng công cụ đo trên mô hình: đếm số cặp trong đúng một vòng xoắn, rồi đọc chiều dài một vòng và đường kính.", "Chọn một bazơ trên mạch này và xem bazơ đối diện trên mạch kia; lặp lại với vài cặp để thấy quy tắc."],
      ["Mỗi số đo cấu trúc phải đọc từ mô hình, đúng đơn vị. Quy tắc bắt cặp là quy tắc bổ sung giữa hai loại bazơ cố định. Kiểm tra từng ô với mô hình.", "Đối chiếu từng số đo với mô hình và kiểm tra lại quy tắc bắt cặp trên ít nhất ba cặp bazơ."],
    ], [/\b10\s*cặp/i, /3[,.]4/, /\b34\s*Å/, /A\s*[-–]\s*T|G\s*[-–]\s*C/]),
    replication: hints("Nhân đôi ADN", [
      ["Quá trình nhân đôi bắt đầu bằng việc gì: tổng hợp mạch mới hay tách hai mạch cũ ra?", "Mỗi phân tử ADN con được tạo ra giữ lại gì từ phân tử mẹ?"],
      ["Mạch mới được tổng hợp dựa trên khuôn là mạch cũ, theo nguyên tắc bổ sung.", "Nhân đôi diễn ra theo một trình tự giai đoạn; giai đoạn sau cần kết quả của giai đoạn trước."],
      ["Sắp xếp lại các giai đoạn theo thứ tự cần thiết, rồi điền từng nucleotide của mạch mới đối diện với mạch khuôn.", "Đi dọc mạch khuôn từng bazơ một và chọn bazơ bổ sung cho mạch mới."],
      ["Hai mạch phải tách ra trước thì mới làm khuôn được; mỗi nucleotide mới bắt cặp bổ sung với khuôn. So mỗi ADN con với ADN mẹ để biết nó gồm những mạch nào.", "Kiểm tra thứ tự giai đoạn, từng cặp bổ sung và thành phần của mỗi ADN con."],
    ], [/bán bảo toàn/i]),
    transcription: hints("Phiên mã", [
      ["mARN được tổng hợp dựa trên mạch nào của gen, và trong ARN có loại bazơ nào thay cho T?", "Mỗi bazơ trên mạch khuôn ứng với bazơ nào trên mARN?"],
      ["Phiên mã tạo mARN bổ sung với mạch khuôn của gen; ARN không có T mà có một bazơ khác thay thế.", "Mạch mARN đọc theo đúng thứ tự của mạch khuôn, từng bazơ một."],
      ["Đi dọc mạch khuôn từ đầu đến cuối, mỗi bazơ ghi bazơ bổ sung của ARN vào mARN.", "Kiểm tra lại các vị trí em đã ghi: có chỗ nào dùng bazơ của ADN thay vì của ARN không?"],
      ["mARN là bản sao bổ sung của mạch khuôn theo quy tắc bắt cặp, với bazơ của ARN thay cho T. Kiểm tra từng vị trí theo quy tắc đó.", "Đối chiếu từng bazơ của mARN với bazơ tương ứng trên mạch khuôn."],
    ]),
    translation: hints("Dịch mã", [
      ["Mỗi amino acid được mã hoá bởi bao nhiêu nucleotide liên tiếp trên mARN?", "Em đọc mARN từ đâu và dừng lại ở đâu?"],
      ["Dịch mã đọc mARN theo từng bộ ba liên tiếp, không chồng lên nhau; mỗi bộ ba tra trong bảng mã di truyền.", "Số tổ hợp có thể có tăng theo số nucleotide trong một mã: với n vị trí, mỗi vị trí có bốn khả năng."],
      ["Chia mARN thành các bộ ba từ đầu, tra từng bộ ba trong bảng và dừng ở bộ ba kết thúc.", "Tính số tổ hợp cho mã gồm 1, 2 và 3 nucleotide bằng cách nhân số khả năng ở mỗi vị trí."],
      ["Mã di truyền là mã bộ ba: đọc liên tiếp từ điểm bắt đầu, mỗi bộ ba ứng với một amino acid hoặc tín hiệu kết thúc. Mã một hoặc hai nucleotide không đủ tổ hợp cho tất cả amino acid.", "Kiểm tra cách chia bộ ba, từng lần tra bảng, điểm dừng, và phép tính số tổ hợp."],
    ], [/\b(16|64)\b/]),
    mutation: hints("Đột biến", [
      ["Sau đột biến, bộ ba nào trên mARN thay đổi và nó đổi thành gì?", "Bộ ba mới mã hoá amino acid nào khi tra bảng?"],
      ["Đột biến thay một nucleotide có thể giữ nguyên, đổi hoặc làm dừng sớm chuỗi amino acid, tuỳ bộ ba mới.", "Ảnh hưởng của đột biến lên protein phụ thuộc vào amino acid mà bộ ba mới mã hoá."],
      ["So từng bộ ba trước và sau đột biến để tìm bộ ba khác nhau, rồi tra bảng cho bộ ba mới.", "Ghi bộ ba cũ và mới cạnh nhau, tra cả hai trong bảng rồi so sánh."],
      ["Xác định bộ ba bị đổi, tra amino acid của nó, rồi so với amino acid ban đầu: giống nhau, khác nhau, hay là tín hiệu kết thúc. Từ đó suy ra ảnh hưởng lên protein.", "Ba bước: tìm bộ ba đổi, tra bảng, so với ban đầu. Kết luận ảnh hưởng dựa trên kết quả so sánh."],
    ]),
    "concept:flow": hints("Dòng thông tin di truyền", [
      ["Thông tin từ gen đi qua những phân tử nào trước khi thành protein?", "Trong các trạm em vừa làm, trạm nào tạo ra sản phẩm cho trạm tiếp theo?"],
      ["Thông tin di truyền được truyền qua các quá trình em vừa làm: mỗi quá trình dùng sản phẩm của quá trình trước.", "Hãy nối các trạm theo thứ tự sản phẩm: cái gì là khuôn, cái gì là sản phẩm."],
      ["Xếp các trạm em đã làm theo thứ tự thông tin đi qua, rồi so với từng kết luận.", "Ghi tên sản phẩm của mỗi trạm và nối chúng thành một chuỗi."],
      ["Một kết luận đúng phải mô tả đúng thứ tự thông tin đi từ gen qua các phân tử trung gian tới protein, khớp với các trạm em đã làm. Loại kết luận sai thứ tự hoặc thiếu bước.", "Đối chiếu từng kết luận với chuỗi sản phẩm em vừa ghi."],
    ], [/ADN\s*→\s*m?ARN\s*→/i]),
    "concept:geneRole": hints("Vai trò của gen", [
      ["Trình tự nucleotide của gen quyết định điều gì ở protein?", "Khi gen bị đột biến, điều gì ở protein có thể thay đổi?"],
      ["Gen mang thông tin quy định trình tự amino acid của protein thông qua mARN.", "Thay đổi trình tự gen có thể làm thay đổi trình tự amino acid."],
      ["Xem lại trạm đột biến: thay đổi trên gen dẫn tới thay đổi gì ở chuỗi amino acid?", "Nối kết quả trạm dịch mã với kết quả trạm đột biến."],
      ["Vai trò của gen thể hiện ở việc trình tự của nó quy định trình tự của sản phẩm cuối cùng. Chọn kết luận nêu đúng mối quan hệ này và khớp với trạm đột biến.", "Một kết luận đúng phải giải thích được vì sao đổi một nucleotide có thể đổi protein."],
    ]),
  },
};

// FL-16 eye anatomy and optics (eye-anatomy-optics@1.0.0). Phase 1 parts; phase 2 per-scenario reasons.
const EYE: Catalog = {
  order: ["phase1", "phase2:distance", "phase2:focus", "phase2:relaxedFar", "phase2:glasses"],
  keyOf: (unmet) => {
    if (unmet.startsWith("phase1:")) return "phase1";
    const reasons = unmet.split(":")[2]?.split("+") ?? [];
    const order = ["distance", "focus", "relaxedFar", "glasses"];
    const first = order.find((reason) => reasons.includes(reason));
    return first ? `phase2:${first}` : null;
  },
  answerOf: (evidence, key) => (key === "phase1" ? evidence?.phase1 : evidence?.phase2),
  criteria: {
    phase1: hints("Các bộ phận của mắt", [
      ["Với bộ phận còn sai, ánh sáng đi qua nó trước hay sau thể thuỷ tinh?", "Bộ phận đó có nhiệm vụ gì: cho ánh sáng đi qua, điều chỉnh, hay thu nhận ảnh?"],
      ["Ánh sáng vào mắt lần lượt qua các bộ phận trong suốt rồi tạo ảnh trên lớp nhận ánh sáng ở đáy mắt.", "Mỗi bộ phận của mắt có vị trí và chức năng riêng; hãy gắn tên theo cả hai điều đó."],
      ["Chuyển sang chế độ khám phá, bấm từng bộ phận để đọc mô tả, rồi gắn lại tên cho bộ phận còn sai.", "Lần theo đường đi của ánh sáng từ ngoài vào trong mắt và gọi tên từng lớp nó đi qua."],
      ["Gọi tên bộ phận dựa trên vị trí trên đường đi của ánh sáng và chức năng của nó. Kiểm tra lại từng bộ phận còn sai bằng mô tả trong chế độ khám phá.", "Một tên đúng phải khớp cả vị trí lẫn chức năng; đối chiếu từng nhãn với mô tả của bộ phận."],
    ]),
    "phase2:distance": hints("Khoảng cách vật", [
      ["Tình huống này yêu cầu nhìn vật ở gần hay ở xa? Em đã đặt vật đúng khoảng cách đó chưa?", "Đọc lại đề của tình huống: vật cần nhìn nằm ở đâu?"],
      ["Mỗi tình huống có một khoảng cách vật cố định; ảnh chỉ đánh giá được khi vật ở đúng chỗ đó.", "Khoảng cách vật quyết định mắt phải điều tiết nhiều hay ít."],
      ["Đặt lại vật đúng khoảng cách ghi trong tình huống trước khi điều chỉnh mắt hoặc kính.", "Kiểm tra thanh khoảng cách: vạch hiện tại có trùng yêu cầu của tình huống không?"],
      ["Mọi bước sau chỉ có nghĩa khi vật ở đúng khoảng cách của tình huống. Hãy đặt đúng khoảng cách trước, rồi mới điều tiết và chọn kính.", "Làm theo thứ tự: đặt vật đúng chỗ, rồi điều tiết, rồi mới xét kính."],
    ]),
    "phase2:focus": hints("Ảnh rõ trên võng mạc", [
      ["Ảnh của vật đang nằm trước, đúng trên hay sau lớp nhận ánh sáng ở đáy mắt?", "Thể thuỷ tinh cần phồng lên hay dẹt xuống để ảnh rơi đúng chỗ?"],
      ["Mắt điều tiết bằng cách thay đổi độ phồng của thể thuỷ tinh để ảnh rõ nét trên võng mạc.", "Vật càng gần thì thể thuỷ tinh càng phải làm việc nhiều hơn để giữ ảnh rõ."],
      ["Kéo thanh điều tiết từ từ và quan sát chùm tia: dừng khi các tia hội tụ đúng trên võng mạc.", "Nhìn vị trí điểm hội tụ của chùm tia và điều chỉnh cho tới khi nó nằm đúng trên võng mạc."],
      ["Ảnh rõ khi chùm tia hội tụ đúng trên võng mạc. Nếu điều tiết hết mức mà vẫn không được, mắt cần thêm kính. Hãy xét điều tiết trước, kính sau.", "Kiểm tra điểm hội tụ sau mỗi lần điều chỉnh; dừng khi nó trùng võng mạc."],
    ]),
    "phase2:relaxedFar": hints("Mắt khi nhìn xa", [
      ["Khi nhìn vật ở rất xa, mắt bình thường cần điều tiết nhiều hay gần như không điều tiết?", "Ở tình huống nhìn xa, thể thuỷ tinh của em đang ở trạng thái nào?"],
      ["Mắt bình thường nhìn vật ở xa khi không điều tiết; điều tiết chủ yếu cần cho vật ở gần.", "Mắt ở trạng thái nghỉ thì thể thuỷ tinh dẹt nhất."],
      ["Ở tình huống nhìn xa, đưa thanh điều tiết về trạng thái nghỉ rồi xem ảnh còn rõ không.", "Thử giảm điều tiết dần và theo dõi ảnh ở tình huống nhìn xa."],
      ["Nhìn xa với mắt đã được điều chỉnh đúng thì không cần điều tiết. Nếu phải điều tiết mới thấy rõ vật ở xa, có điều gì đó chưa đúng với mắt hoặc kính.", "So trạng thái thể thuỷ tinh ở tình huống nhìn xa với tình huống nhìn gần."],
    ]),
    "phase2:glasses": hints("Chọn kính", [
      ["Không đeo kính, ảnh của vật nằm trước hay sau võng mạc?", "Kính em chọn làm chùm tia hội tụ sớm hơn hay muộn hơn?"],
      ["Kính hội tụ làm chùm tia hội tụ sớm hơn; kính phân kỳ làm chùm tia hội tụ muộn hơn.", "Chọn kính để đưa ảnh về đúng võng mạc khi mắt không điều tiết."],
      ["Bỏ kính ra, xem ảnh lệch về phía nào so với võng mạc, rồi chọn loại kính đẩy ảnh về phía ngược lại.", "Thử từng loại kính và quan sát điểm hội tụ dịch chuyển theo hướng nào."],
      ["Loại kính được chọn theo vị trí ảnh khi chưa đeo kính: kính phải dịch ảnh về đúng võng mạc. Xác định ảnh đang lệch về phía nào rồi suy ra loại kính.", "Hai câu hỏi: ảnh đang ở đâu so với võng mạc, và loại kính nào dịch ảnh theo hướng cần thiết?"],
    ], [/cận thị[^.]{0,30}(phân kỳ|hội tụ)/i, /viễn thị[^.]{0,30}(phân kỳ|hội tụ)/i, /(phân kỳ|hội tụ)[^.]{0,30}(cận thị|viễn thị)/i]),
  },
};

// FL-05 buoyancy (buoyancy-archimedes@1.0.0). Evidence: specimenId, submergedVolumeMl, overflowMl, measuredBuoyantForceN.
const BUOYANCY: Catalog = {
  order: ["overflow", "force"],
  answerOf: (evidence, key) => (key === "overflow" ? [evidence?.overflowMl, evidence?.submergedVolumeMl] : evidence?.measuredBuoyantForceN),
  criteria: {
    overflow: hints("Thể tích nước tràn", [
      ["Lượng nước tràn ra khỏi bình tràn liên quan thế nào với phần vật chìm trong nước?", "Em đã đổ đầy bình tràn tới miệng vòi trước khi thả vật chưa?"],
      ["Thể tích nước tràn ra bằng thể tích phần vật chìm trong nước.", "Bình tràn chỉ đo đúng khi nước đã ngang miệng vòi trước lúc thả vật."],
      ["Đổ nước tới miệng vòi, chờ nước ngừng nhỏ giọt, rồi thả vật và đọc thể tích nước hứng được trong ống đong.", "Đọc ống đong hứng nước tràn với mắt ngang đáy mặt cong."],
      ["Vật chìm chiếm chỗ của một lượng nước đúng bằng thể tích phần chìm, và lượng đó tràn ra ngoài. Đo lượng nước tràn cẩn thận là đo được thể tích phần chìm.", "Kiểm tra ba điều: bình đầy tới miệng vòi trước khi thả, hứng hết nước tràn, đọc ống đong đúng cách."],
    ]),
    force: hints("Lực đẩy Ác-si-mét", [
      ["Số chỉ của lực kế thay đổi thế nào khi vật được nhúng vào nước?", "Lực đẩy của nước liên quan thế nào với hai lần đọc lực kế?"],
      ["Lực đẩy Ác-si-mét bằng hiệu số chỉ lực kế khi vật ở ngoài không khí và khi vật chìm trong nước.", "Lực đẩy cũng bằng trọng lượng của phần nước bị vật chiếm chỗ."],
      ["Đọc lực kế khi vật treo ngoài không khí, rồi khi vật chìm hẳn trong nước, rồi lấy hiệu.", "Kiểm tra lực đẩy em đo bằng cách so với trọng lượng của lượng nước tràn ra."],
      ["Nước đẩy vật lên một lực bằng trọng lượng phần chất lỏng bị chiếm chỗ; trên lực kế, lực này là phần số chỉ bị giảm đi khi nhúng vật. Hai cách tính phải cho kết quả gần nhau.", "Tính lực đẩy theo hai cách, từ lực kế và từ nước tràn, rồi xem cách nào em làm sai."],
    ]),
  },
};

export const STATION_HINT_CATALOGS: Readonly<Record<string, Catalog>> = {
  [densityStationsEvaluator.rubricRef]: DENSITY,
  [geneProteinStationsEvaluator.rubricRef]: GENE,
  [eyeOpticsEvaluator.rubricRef]: EYE,
  [buoyancyLabEvaluator.rubricRef]: BUOYANCY,
};

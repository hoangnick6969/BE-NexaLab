import { CHECKPOINT_MISCONCEPTION_RULES } from "./checkpoint-hint-rules";

/**
 * SAI-02: teacher-facing names of the B8 misconception ids (checkpoint-misconceptions@3).
 * Hypotheses from one wrong answer, never a diagnosis; never shown to students or parents (BR-09, BR-11).
 */
export const MISCONCEPTION_LABEL_RULES = CHECKPOINT_MISCONCEPTION_RULES;

export const MISCONCEPTION_LABELS: Readonly<Record<string, string>> = {
  // FL-21 food web
  FW_DECOMPOSER_AS_CONSUMER: "Xếp sinh vật phân giải vào nhóm sinh vật tiêu thụ",
  FW_ANIMAL_AS_PRODUCER: "Xếp động vật vào nhóm sinh vật sản xuất",
  FW_PLANT_NOT_PRODUCER: "Không xếp cây xanh vào nhóm sinh vật sản xuất",
  FW_CHAIN_NOT_FROM_PRODUCER: "Chuỗi thức ăn không bắt đầu từ sinh vật sản xuất",
  FW_CHAIN_TOO_SHORT: "Chuỗi thức ăn thiếu mắt xích",
  FW_CHAIN_BROKEN_LINK: "Nối hai loài không có quan hệ ăn – bị ăn trực tiếp",
  FW_ENERGY_STOP_EARLY: "Tính năng lượng dừng trước bậc cuối của chuỗi",
  FW_ENERGY_NO_LOSS: "Cho rằng năng lượng không hao hụt qua các bậc",
  FW_ALL_DECREASE: "Cho rằng mất một loài thì mọi loài khác đều giảm",
  FW_NO_LINK: "Bỏ qua mối liên hệ trực tiếp giữa hai loài",
  FW_ARROW_REVERSED: "Đọc ngược chiều mũi tên ăn – bị ăn",
  FW_CAUSE_PROTECTIVE_INCLUDED: "Chọn hoạt động bảo vệ là nguyên nhân mất cân bằng",
  FW_CAUSE_MISSING: "Bỏ sót nguyên nhân gây mất cân bằng",
  // FL-20 ecological tolerance
  ECO_OPTIMUM_ONLY: "Cho rằng sinh vật chỉ sống được ở điểm cực thuận",
  ECO_NO_UPPER_LIMIT: "Không nhận ra giới hạn trên của nhiệt độ",
  ECO_OPTIMUM_AS_LIMIT: "Nhầm điểm cực thuận với giới hạn sinh thái",
  ECO_ZERO_LOWER: "Lấy 0 °C làm giới hạn dưới",
  ECO_AVERAGE_ONLY: "Chỉ xét nhiệt độ trung bình, bỏ qua lúc lạnh nhất và nóng nhất",
  ECO_DENSITY_UNIT: "Nhầm đơn vị diện tích khi tính mật độ",
  // FL-01 circuit bulb
  CB_CLOSED_NO_CURRENT: "Cho rằng mạch kín vẫn không có dòng điện",
  CB_OPEN_STILL_LIT: "Cho rằng đèn vẫn sáng khi mạch hở",
  // FL-25 electromagnetic induction
  EM_MAGNET_PRESENCE: "Cho rằng chỉ cần có nam châm (đứng yên) là có dòng điện cảm ứng",
  EM_DIRECTION_FIXED: "Cho rằng chiều dòng điện cảm ứng không đổi",
  EM_ROTATE_ONE_WAY: "Cho rằng quay nam châm chỉ tạo dòng điện một chiều",
  // FL-03 density
  DENS_DIVIDED_WRONG_WAY: "Lấy thể tích chia khối lượng khi tính khối lượng riêng",
  DENS_CUP_MASS_INCLUDED: "Tính cả khối lượng cốc vào khối lượng nước",
  DENS_LEVEL_NOT_DIFFERENCE: "Dùng mực nước sau khi thả làm thể tích vật, không lấy phần nước dâng lên",
  DENS_UNIT_FACTOR: "Đổi g/cm³ sang kg/m³ sai hệ số",
  // FL-05 buoyancy
  BUOY_WEIGHT_AS_BUOYANT: "Lấy trọng lượng của vật làm lực đẩy Ác-si-mét",
  BUOY_READING_IN_WATER: "Lấy số chỉ lực kế khi vật trong nước làm lực đẩy",
  BUOY_NOT_FULLY_SUBMERGED: "Đo nước tràn khi vật chưa chìm hoàn toàn",
  // FL-06 lever
  LEVER_ARM_IGNORED: "Bỏ qua cánh tay đòn khi dự đoán chiều quay",
  LEVER_TILT_REVERSED: "Dự đoán ngược chiều quay của đòn bẩy",
  LEVER_MOMENT_ADDED: "Cộng lực với cánh tay đòn thay vì nhân",
  LEVER_SIGNED_ARM: "Lấy vị trí có dấu âm làm cánh tay đòn",
  LEVER_ALWAYS_GAIN: "Cho rằng đòn bẩy nào cũng lợi về lực",
  LEVER_DIRECTION_RULE: "Nhầm điều kiện đòn bẩy đổi hướng lực",
  // FL-07 thermal energy
  TH_FINAL_AS_RISE: "Ghi nhiệt độ cuối vào chỗ độ tăng nhiệt độ",
  TH_NOT_PROPORTIONAL: "Không thấy độ tăng nhiệt độ tỉ lệ với năng lượng cung cấp",
  TH_NO_HEAT_LOSS: "Cho rằng thí nghiệm thật không có hao phí nhiệt",
  TH_ENERGY_HEAT_UNRELATED: "Cho rằng nhiệt lượng không liên quan tới điện năng cung cấp",
  // FL-10 mass conservation
  MC_THINKS_MASS_DECREASES: "Cho rằng khối lượng giảm sau phản ứng",
  MC_THINKS_MASS_INCREASES: "Cho rằng khối lượng tăng sau phản ứng",
  MC_NEW_SUBSTANCE_HEAVIER: "Cho rằng chất mới tạo thành làm khối lượng tăng",
  MC_PRECIPITATE_NOT_WEIGHED: "Cho rằng chất rắn lắng xuống không được cân",
  MC_OPEN_SYSTEM_GAS: "Không tính đến khí thoát ra khỏi cốc hở",
  MC_CLOSED_SYSTEM_CHANGES: "Cho rằng khối lượng trong bình kín thay đổi",
  // FL-27 gene to protein
  GENE_COPIED_PARENT: "Chép lại mạch khuôn thay vì bắt cặp bổ sung khi tái bản",
  GENE_STAGE_ORDER: "Sai thứ tự các giai đoạn tái bản",
  GENE_NOT_SEMI_CONSERVATIVE: "Không thấy tái bản là bán bảo toàn",
  GENE_COPIED_TEMPLATE_STRAND: "Chép lại mạch khuôn thay vì bắt cặp bổ sung khi phiên mã",
  GENE_READ_PAST_STOP: "Dịch mã tiếp sau codon kết thúc",
  GENE_COMBINATIONS_ADDED: "Cộng thay vì nhân khi đếm tổ hợp bộ mã",
  GENE_MUTATION_NOT_APPLIED: "Chưa áp dụng đột biến vào codon",
  GENE_EVERY_CHANGE_CHANGES_PROTEIN: "Cho rằng mọi đột biến đều làm đổi axit amin",
  GENE_STOP_AS_AMINO_ACID: "Coi codon kết thúc như một axit amin",
  // FL-16 eye optics
  EYE_MYOPIA_CONVERGING: "Dùng kính hội tụ cho mắt cận",
  EYE_HYPEROPIA_DIVERGING: "Dùng kính phân kỳ cho mắt viễn",
  EYE_GLASSES_FOR_NORMAL: "Đeo kính cho mắt bình thường",
  EYE_FAR_ACCOMMODATION: "Cho rằng nhìn xa mắt phải điều tiết",
  EYE_CORNEA_LENS_SWAP: "Nhầm giác mạc với thể thuỷ tinh",
  EYE_HUMOURS_SWAP: "Nhầm thuỷ dịch với dịch kính",
};

export const misconceptionLabel = (id: string) => MISCONCEPTION_LABELS[id] ?? id;

import { CHECKPOINT_MISCONCEPTION_RULES } from "./checkpoint-hint-rules";

/**
 * SAI-02: teacher-facing names of the B8 misconception ids (checkpoint-misconceptions@1).
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
};

export const misconceptionLabel = (id: string) => MISCONCEPTION_LABELS[id] ?? id;

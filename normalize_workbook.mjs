import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const outputDirectory = 'C:/Users/MyPC/Desktop/CodeVS/Project_III/outputs/20261106-project3-sample';
const output = `${outputDirectory}/Bảng nhu cầu lịch học - dữ liệu mẫu.xlsx`;
const wb = Workbook.create();
const navy = '#24476B', pale = '#EAF1F7';

function addSheet(name, title, description, headers, rows, tableName, widths) {
  const s = wb.worksheets.add(name);
  s.showGridLines = false;
  const last = String.fromCharCode(64 + headers.length);
  s.getRange(`A1:${last}1`).merge();
  s.getRange('A1').values = [[title]];
  s.getRange(`A1:${last}1`).format = {fill:navy,font:{name:'Aptos Display',size:16,bold:true,color:'#FFFFFF'},verticalAlignment:'center'};
  s.getRange(`A2:${last}2`).merge();
  s.getRange('A2').values = [[description]];
  s.getRange(`A2:${last}2`).format = {fill:pale,font:{name:'Aptos',size:10,color:'#263445'},wrapText:true,verticalAlignment:'center'};
  s.getRange(`A4:${last}${4+rows.length}`).values = [headers,...rows];
  const table = s.tables.add(`A4:${last}${4+rows.length}`, true, tableName);
  table.style = 'TableStyleMedium2';
  s.getRange(`A1:${last}${4+rows.length}`).format.font = {name:'Aptos',size:10,color:'#263445'};
  s.getRange(`A4:${last}4`).format = {fill:navy,font:{name:'Aptos',size:10,bold:true,color:'#FFFFFF'},wrapText:true,verticalAlignment:'center'};
  s.getRange(`A1:${last}${4+rows.length}`).format.verticalAlignment = 'center';
  s.getRange(`A1:${last}${4+rows.length}`).format.wrapText = true;
  s.getRange(`A1:${last}1`).format.rowHeight = 30;
  s.getRange(`A2:${last}2`).format.rowHeight = 32;
  s.getRange(`A4:${last}4`).format.rowHeight = 32;
  widths.forEach((w,i)=>s.getRange(`${String.fromCharCode(65+i)}:${String.fromCharCode(65+i)}`).format.columnWidth=w);
  s.freezePanes.freezeRows(4);
  return s;
}

const guide = addSheet('Doc huong dan','INPUT THỜI KHÓA BIỂU','Bộ dữ liệu mẫu nhỏ đã chuẩn hóa theo khóa. Mỗi dòng là một bản ghi; mã định danh dùng để liên kết bảng và có thể ánh xạ sang khóa chính/khóa ngoại trong cơ sở dữ liệu.','#',[], 'GuideTable',[26]);
// Replace the temporary one-column guide layout with a readable instruction table.
guide.getRange('A4:A4').clear({applyTo:'all'});
guide.tables.items[0].delete();
guide.getRange('A4:B10').values = [
  ['Nội dung','Quy ước nhập'],
  ['Bộ dữ liệu','Toàn bộ tên và lịch dưới đây là dữ liệu giả định để thử app, không đại diện một trường cụ thể hay định mức chính thức.'],
  ['Mã định danh','Mã như TCH-MATH-01, CLS-6A, SUB-MATH là mã duy nhất. Các bảng liên kết phải dùng đúng mã đã có trong bảng danh mục.'],
  ['Nhu cầu lớp-môn','NhuCau ghi số tiết cần có của từng môn cho mỗi lớp mỗi tuần. Bộ demo dùng cùng một phân bố 27 tiết cho mỗi lớp.'],
  ['Phân công tham khảo','PhanCong là phương án mẫu để đối chiếu, không phải kết quả thuật toán. Chênh lệch với NhuCau chỉ được báo cảnh báo.'],
  ['Tải giáo viên','Tải tham khảo thấp hơn mức tối thiểu sẽ hiện cảnh báo. Ba giáo viên Công nghệ, GDCD và Tin học hiện có 16 tiết mỗi người; đây là dữ liệu minh họa để thấy cảnh báo.'],
  ['Học kỳ và ngày nghỉ','HocKy và NgayNghi là ví dụ có thể sửa theo kịch bản. Ngày nghỉ là ngày cụ thể trong năm mô phỏng.']
];
guide.tables.add('A4:B10',true,'GuideTable2').style='TableStyleMedium2';
guide.getRange('A4:A10').format.columnWidth=24; guide.getRange('B4:B10').format.columnWidth=100;
guide.getRange('A4:B10').format.wrapText=true; guide.getRange('A4:B10').format.rowHeight=36;
guide.getRange('A4:B10').format.verticalAlignment='center';
guide.getRange('A4:B4').format={fill:navy,font:{bold:true,color:'#FFFFFF'}};

const classRows = [];
for (const grade of [6,7,8,9]) for (const section of ['A','B','C','D']) classRows.push([`CLS-${grade}${section}`,`${grade}${section}`,grade]);
addSheet('Lop','DANH MỤC LỚP','16 lớp giả định, gồm bốn lớp A–D ở mỗi khối 6–9. Mã lớp được dùng ở NhuCau và PhanCong.',['lop_id','ten_lop','khoi'],classRows,'LopTable',[18,20,12]);

const subjects = [
 ['SUB-MATH','Toán'],['SUB-LIT','Ngữ văn'],['SUB-ENG','Tiếng Anh'],['SUB-SCI','Khoa học tự nhiên'],
 ['SUB-HISTGEO','Lịch sử và Địa lý'],['SUB-PE','Giáo dục thể chất'],['SUB-ART','Nghệ thuật'],
 ['SUB-CIVIC','Giáo dục công dân'],['SUB-TECH','Công nghệ'],['SUB-INFO','Tin học'],
];
addSheet('Mon','DANH MỤC MÔN HỌC','Danh mục giả định để minh họa quan hệ khóa ngoại. Số tiết trong NhuCau là dữ liệu mẫu, không phải chương trình chính thức.',['mon_id','ten_mon'],subjects,'MonTable',[20,34]);

const teachers = [
 ['TCH-MATH-01','Giáo viên Toán 01'],['TCH-MATH-02','Giáo viên Toán 02'],
 ['TCH-LIT-01','Giáo viên Ngữ văn 01'],['TCH-LIT-02','Giáo viên Ngữ văn 02'],
 ['TCH-ENG-01','Giáo viên Tiếng Anh 01'],['TCH-SCI-01','Giáo viên Khoa học tự nhiên 01'],
 ['TCH-HISTGEO-01','Giáo viên Lịch sử và Địa lý 01'],['TCH-PEART-01','Giáo viên Thể chất và Nghệ thuật 01'],
 ['TCH-CIVIC-01','Giáo viên Giáo dục công dân 01'],
 ['TCH-TECH-01','Giáo viên Công nghệ 01'],
 ['TCH-INFO-01','Giáo viên Tin học 01'],
];
addSheet('GiaoVien','DANH MỤC GIÁO VIÊN','Tên hiển thị đều là tên vai trò giả định, không phải người thật. Mỗi mã giáo viên là duy nhất.',['giao_vien_id','ten_hien_thi'],teachers,'GiaoVienTable',[24,48]);

const teacherSubjects = [
 ['TCH-MATH-01','SUB-MATH'],['TCH-MATH-02','SUB-MATH'],
 ['TCH-LIT-01','SUB-LIT'],['TCH-LIT-02','SUB-LIT'],['TCH-ENG-01','SUB-ENG'],
 ['TCH-SCI-01','SUB-SCI'],['TCH-HISTGEO-01','SUB-HISTGEO'],
 ['TCH-PEART-01','SUB-PE'],['TCH-PEART-01','SUB-ART'],
 ['TCH-CIVIC-01','SUB-CIVIC'],['TCH-TECH-01','SUB-TECH'],['TCH-INFO-01','SUB-INFO'],
];
addSheet('GV_Mon','CHUYÊN MÔN GIÁO VIÊN','Mỗi dòng là một cặp giáo viên–môn có thể dạy. Một giáo viên có thể có nhiều chuyên môn trong dữ liệu giả định này.',['giao_vien_id','mon_id'],teacherSubjects,'GvMonTable',[24,22]);

const weeklyNeeds = [
 ['SUB-MATH',5],['SUB-LIT',5],['SUB-ENG',4],['SUB-SCI',4],['SUB-HISTGEO',3],
 ['SUB-PE',2],['SUB-ART',1],['SUB-CIVIC',1],['SUB-TECH',1],['SUB-INFO',1],
];
const demandRows = [];
const assignmentRows = [];
const assignTeacher = (subjectId, classIndex) => {
  if (subjectId === 'SUB-MATH') return classIndex < 8 ? 'TCH-MATH-01' : 'TCH-MATH-02';
  if (subjectId === 'SUB-LIT') return classIndex < 8 ? 'TCH-LIT-01' : 'TCH-LIT-02';
  if (subjectId === 'SUB-ENG') return 'TCH-ENG-01';
  if (subjectId === 'SUB-SCI') return 'TCH-SCI-01';
  if (subjectId === 'SUB-HISTGEO') return 'TCH-HISTGEO-01';
  if (subjectId === 'SUB-PE' || subjectId === 'SUB-ART') return 'TCH-PEART-01';
  if (subjectId === 'SUB-CIVIC') return 'TCH-CIVIC-01';
  if (subjectId === 'SUB-TECH') return 'TCH-TECH-01';
  return 'TCH-INFO-01';
};
let assignmentNumber = 1;
classRows.forEach(([classId], classIndex) => weeklyNeeds.forEach(([subjectId, periods]) => {
  demandRows.push([classId,subjectId,periods]);
  assignmentRows.push([`ASG-${String(assignmentNumber++).padStart(3,'0')}`,classId,subjectId,assignTeacher(subjectId,classIndex),periods]);
}));
addSheet('NhuCau','NHU CẦU TIẾT THEO LỚP','Mỗi lớp có 27 tiết/tuần trong bộ dữ liệu giả định. Bố trí giống nhau giữa các khối chỉ để đơn giản hóa ví dụ; không xem là định mức/chương trình chính thức.',['lop_id','mon_id','so_tiet_tuan'],demandRows,'NhuCauTable',[18,22,20]);
const assign = addSheet('PhanCong','PHÂN CÔNG THAM KHẢO','Phương án minh họa để đối chiếu nhu cầu và tải tiết. Đây không phải kết quả do thuật toán tạo; thuật toán sau này sẽ tự tìm phương án.',['phan_cong_id','lop_id','mon_id','giao_vien_id','so_tiet_tuan'],assignmentRows,'PhanCongTable',[18,18,20,25,20]);
const days=['Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu'];
const slotRows=[];
const minsToExcelTime=m=>m/(24*60);
for (const [di,day] of days.entries()) {
  slotRows.push([`SLOT-D${di+1}-AM-TRUYBAI`,day,'Sáng',0,minsToExcelTime(6*60+45),15,0,'Hoạt động','Không tính vào tiết dạy']);
  const morning=[7*60,7*60+50,8*60+50,9*60+40,10*60+30];
  const morningBreak=[5,15,5,5,0];
  morning.forEach((start,i)=>slotRows.push([`SLOT-D${di+1}-AM-${String(i+1).padStart(2,'0')}`,day,'Sáng',i+1,minsToExcelTime(start),45,morningBreak[i],'Tiết học','']));
  const afternoon=[13*60+30,14*60+20,15*60+20,16*60+10];
  const afternoonBreak=[5,15,5,0];
  afternoon.forEach((start,i)=>{
    const homeroom = day === 'Thứ Sáu' && i === 3;
    slotRows.push([
      `SLOT-D${di+1}-PM-${String(i+1).padStart(2,'0')}`,day,'Chiều',i+1,
      minsToExcelTime(start),45,afternoonBreak[i],homeroom?'Hoạt động':'Tiết học',
      homeroom?'Sinh hoạt lớp; không tính là tiết dạy':'',
    ]);
  });
}
const slots = addSheet('KhungGio','KHUNG GIỜ HỌC','Tuần mẫu thứ Hai–thứ Sáu. Sáng có truy bài 06:45 và 5 tiết học; chiều bắt đầu 13:30, kết thúc 16:55. Tiết cuối chiều thứ Sáu là hoạt động sinh hoạt lớp, không tính là tiết dạy.',['khung_gio_id','thu','buoi','tiet_so','gio_bat_dau','thoi_luong_phut','nghi_sau_tiet_phut','loai_khung','ghi_chu'],slotRows,'KhungGioTable',[25,16,12,12,18,20,24,18,38]);
slots.getRange(`E5:E${4+slotRows.length}`).format.numberFormat='hh:mm';
const blocked = addSheet('GV_Ban','KHUNG GIỜ GIÁO VIÊN KHÔNG THỂ DẠY','PK kép: giao_vien_id + thu + buoi + tiet_so. FK: giao_vien_id → GiaoVien. Mỗi dòng biểu diễn một khung giờ bị chặn.',['giao_vien_id','thu','buoi','tiet_so','ghi_chu'],[
 ['TCH-MATH-01','Thứ Tư','Sáng',1,'Ví dụ giờ bận giả định'],
 ['TCH-MATH-02','Thứ Hai','Sáng',1,'Ví dụ giờ bận giả định'],
 ['TCH-LIT-01','Thứ Sáu','Chiều',2,'Ví dụ giờ bận giả định'],
 ['TCH-LIT-02','Thứ Ba','Chiều',3,'Ví dụ giờ bận giả định'],
 ['TCH-ENG-01','Thứ Tư','Chiều',4,'Ví dụ giờ bận giả định'],
 ['TCH-SCI-01','Thứ Ba','Sáng',1,'Ví dụ giờ bận giả định'],
 ['TCH-HISTGEO-01','Thứ Năm','Sáng',3,'Ví dụ giờ bận giả định'],
 ['TCH-PEART-01','Thứ Sáu','Sáng',4,'Ví dụ giờ bận giả định'],
 ['TCH-INFO-01','Thứ Hai','Chiều',2,'Ví dụ giờ bận giả định']
],'GvBanTable',[20,16,12,12,44]);

const semester = addSheet('HocKy','CẤU HÌNH HỌC KỲ','Nhập ngày bắt đầu và số tuần. Ngày kết thúc được tính tự động: ngày bắt đầu + (số tuần × 7 ngày) − 1 ngày. Dòng hiện tại là dữ liệu giả định, hãy sửa theo học kỳ bạn muốn mô phỏng.',['hoc_ky_id','ten_hoc_ky','ngay_bat_dau','so_tuan'],[
 ['SEM-DEMO','Học kỳ mẫu - cần chỉnh sửa',new Date('2026-09-07T00:00:00.000Z'),18]
],'HocKyTable',[18,32,22,16]);
semester.getRange('C5:C100').format.numberFormat='yyyy-mm-dd';
semester.getRange('D5:D100').dataValidation={rule:{type:'whole',operator:'between',formula1:1,formula2:52}};
const holidays = addSheet('NgayNghi','NGÀY NGHỈ CỐ ĐỊNH','Mỗi dòng là một ngày nghỉ cụ thể trong năm bạn mô phỏng. Có thể giữ ngày nghỉ ngoài học kỳ; thuật toán sau này sẽ chỉ loại các ngày giao với học kỳ.',['ngay_nghi_id','ngay','ten_ngay_nghi'],[['','',''],['','','']],'NgayNghiTable',[20,22,42]);
holidays.getRange('B5:B100').format.numberFormat='yyyy-mm-dd';
holidays.getRange('A5:C6').values=[
 ['HOL-2026-09-02',new Date('2026-09-02T00:00:00.000Z'),'Quốc khánh (ngày mẫu)'],
 ['HOL-2027-01-01',new Date('2027-01-01T00:00:00.000Z'),'Tết Dương lịch (ngày mẫu)'],
];

const checkRows=[
 ['IN-01','Mã định danh không rỗng và không trùng','Đạt','Có 16 lớp, 10 môn, 11 giáo viên và 160 dòng nhu cầu/phân công tham khảo với mã duy nhất.','Tiếp tục kiểm tra khi thêm dòng.'],
 ['IN-02','Khóa ngoại trỏ đến bản ghi có thật','Đạt','Các mã lớp, môn và giáo viên ở bảng liên kết đều có trong bảng danh mục.','Nếu thêm mã mới, thêm danh mục trước.'],
 ['IN-03','Chuyên môn phù hợp phân công tham khảo','Đạt','Các giáo viên được gán môn đã khai báo ở GV_Mon. Một số hồ sơ có nhiều môn giả định để tạo bộ demo nhỏ.','Chọn môn có trong GV_Mon.'],
 ['IN-04','PhanCong chỉ là dữ liệu tham khảo','Đạt','Phân công mẫu khớp NhuCau để tiện đối chiếu; đây không phải kết quả thuật toán.','Thuật toán sẽ tự tạo phân công trong bước phát triển sau.'],
 ['IN-05','Khung giờ bận nằm trong khung lịch đã khai báo','Đạt','Khung thứ Hai đến thứ Sáu, sáng/chiều đã được khai báo trong KhungGio.','Dùng đúng thứ, buổi, tiết.'],
 ['IN-06','Khung thời gian không chồng lấn và đúng khoảng nghỉ','Đạt','Sáng: 5 tiết học; chiều: 4 khung đến 16:55. Tiết cuối chiều thứ Sáu được dành cho sinh hoạt lớp.','Nếu sửa giờ, kiểm tra lại thời lượng và khoảng nghỉ.'],
 ['IN-07','Hoạt động không tính là tiết dạy','Đạt','Truy bài là Hoạt động ở tiết 0; tiết cuối chiều thứ Sáu là Hoạt động ở tiết 4. Cả hai không tính là tiết dạy.','Chỉ khung loại Tiết học mới được xếp môn và tính dạy.'],
 ['IN-08','Cấu hình học kỳ và các ngày nghỉ','Đã khai báo','Có học kỳ 18 tuần và hai ngày nghỉ cụ thể làm ví dụ.','Sửa theo kịch bản cần mô phỏng; lịch nghỉ thực tế có thể khác.'],
 ['IN-09','Tổng nhu cầu tuần theo lớp','Đạt','16 lớp × 27 tiết = 432 tiết/tuần. Mỗi lớp còn các khung chưa gán môn; đây là mẫu nhỏ để thử dữ liệu.','Có thể thêm môn/tiết để mô phỏng sát hơn.'],
 ['IN-10','Tải tham khảo của từng giáo viên','Cảnh báo','Toán 40/40, Ngữ văn 40/40, Tiếng Anh 64, KHTN 64, LS-ĐL 48, Thể chất/Nghệ thuật 48; mỗi giáo viên GDCD, Công nghệ và Tin học có 16 tiết.','Ba giáo viên dưới mức 19 sẽ được backend cảnh báo; không tự tăng nhu cầu môn.']
];
addSheet('KiemTraInput','KIỂM TRA DỮ LIỆU ĐẦU VÀO','Kết quả phản ánh đúng dữ liệu demo hiện tại. Các dòng Chưa đạt giúp kiểm thử cảnh báo, không có nghĩa cấu trúc workbook bị hỏng.',['ma_kiem_tra','quy_tac','ket_qua','chi_tiet','huong_xu_ly'],checkRows,'KiemTraTable',[18,44,20,78,68]);

// Keep typed numeric values and constrain common input domains in the editable data rows.
for (const name of ['NhuCau','PhanCong']) {
  const s=wb.worksheets.getItem(name); const col=name==='NhuCau'?'C':'E';
  s.getRange(`${col}5:${col}100`).dataValidation={rule:{type:'whole',operator:'between',formula1:1,formula2:40}};
}
for (const name of ['GV_Mon','NhuCau','PhanCong']) {
  const s=wb.worksheets.getItem(name);
  s.getRange('A5:A100').format.fill='#FFF7E6';
}

// Recalculate/inspect/export.
wb.recalculate();
const summary=await wb.inspect({kind:'workbook,sheet,table',maxChars:5000,tableMaxRows:8,tableMaxCols:8});
console.log(summary.ndjson);
const pngs=[];
for (const name of ['Doc huong dan','GiaoVien','GV_Mon','NhuCau','PhanCong','KhungGio','GV_Ban','HocKy','NgayNghi','KiemTraInput']) {
  const preview=await wb.render({sheetName:name,autoCrop:'all',scale:1,format:'png'});
  const bytes=new Uint8Array(await preview.arrayBuffer());
  const path=`C:/Users/MyPC/Desktop/CodeVS/Project_III/${name.replaceAll(' ','_')}_preview.png`;
  await fs.writeFile(path,bytes); pngs.push(path);
}
const xlsx=await SpreadsheetFile.exportXlsx(wb);
await fs.mkdir(outputDirectory,{recursive:true});
await xlsx.save(output);
console.log('Saved',output,'Previews',pngs.join(', '));

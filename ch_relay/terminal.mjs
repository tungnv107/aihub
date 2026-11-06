import readline from 'node:readline';

export function promptLine(message){
  if(!process.stdin.isTTY)throw Error('interactive_terminal_required');
  const terminal=readline.createInterface({input:process.stdin,output:process.stderr});
  return new Promise((resolve,reject)=>{
    let answered=false;
    terminal.once('close',()=>{if(!answered)reject(Error('setup_cancelled'));});
    terminal.once('SIGINT',()=>terminal.close());
    terminal.question(message,value=>{answered=true;terminal.close();resolve(value.trim());});
  });
}
export async function confirmSetup({yes=false}={}){
  if(yes)return true;
  const answer=await promptLine('Lưu công việc trong Codex. Nhấn Enter để áp dụng kết nối, hoặc gõ n để hủy: ');
  return ['', 'y','yes','c','co','có'].includes(answer.toLowerCase());
}
export function showReady(license,{started=false}={}){
  console.log('\nHoàn tất. AIHub '+(started?'đã chạy nền.':'đang chạy nền.'));
  console.log('Hạn key: '+new Date(license.expiresAt).toLocaleString('vi-VN')+'.');
  console.log('Đóng và mở lại Codex sau lần kết nối đầu tiên; đăng nhập ChatGPT của bạn trong Codex.');
  console.log('Bạn có thể đóng terminal. Lần sau chỉ cần chạy: aihub');
  console.log('Xem trạng thái: aihub status · Dừng: aihub stop');
}
export function showError(error){
  const code=error.code??error.message;
  const messages={
    api_key_expired:'Key đã hết hạn. Liên hệ nơi cấp key để gia hạn rồi chạy lại aihub.',
    api_key_disabled:'Key đã bị thu hồi hoặc tắt. Liên hệ nơi cấp key.',
    invalid_api_key:'Key không hợp lệ. Chạy aihub login để nhập lại.',
    api_key_invalid:'Key không đúng định dạng. Nhập lại key do nơi cung cấp dịch vụ cấp.',
    sub2api_unavailable:'Không kết nối được máy chủ cấp quyền. Kiểm tra mạng rồi thử lại.',
    sub2api_license_endpoint_missing:'Máy chủ chưa cài phần tích hợp Ch-relay. Kiểm tra lại địa chỉ hoặc liên hệ nơi cấp key.',
    interactive_terminal_required:'Hãy chạy aihub trong terminal để thiết lập. Tự động hóa dùng --key-stdin --yes --server <URL>.',
    use_key_stdin_or_interactive_terminal:'Hãy chạy trong terminal để nhập key ẩn; tự động hóa dùng --key-stdin.',
    setup_cancelled:'Đã hủy thiết lập. Bạn có thể chạy lại aihub khi sẵn sàng.',
    login_cancelled:'Đã hủy đăng nhập.',
  };
  console.error(messages[code]??'Chưa hoàn tất thiết lập. Chạy aihub --help để xem hướng dẫn.');
  if(/^[a-z_]+$/.test(code))console.error('Mã: '+code);
}

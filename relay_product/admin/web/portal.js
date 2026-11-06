const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>value?new Date(value).toLocaleString('vi-VN'):'Chưa kích hoạt';
const num=value=>Number(value??0).toLocaleString('vi-VN');
const statusLabels={pending:'Chờ kích hoạt',active:'Đang sử dụng',expired:'Đã hết hạn',revoked:'Đã thu hồi'};
const errors={customer_key_invalid:'Key không đúng. Kiểm tra lại key do quản trị viên cấp.',customer_login_required:'Phiên đã hết hạn. Hãy nhập lại key.',customer_rate_limited:'Bạn đã thử nhiều lần. Vui lòng thử lại sau 15 phút.',report_rate_limited:'Đã nhận đủ 10 báo cáo trong giờ này. Vui lòng thử lại sau.',invalid_diagnostic:'Báo cáo không đúng định dạng TDH Relay.',invalid_value:'Số liệu hoặc thời gian trong báo cáo không hợp lệ.',csrf_rejected:'Phiên thao tác đã thay đổi. Vui lòng tải lại trang.'};
let session=null,data=null,generation=0,platform='windows';
async function api(route,body){
  let response;
  try{response=await fetch('/portal/api/'+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'content-type':'application/json','x-csrf-token':session?.csrf??''},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}
  catch{throw Error('Không kết nối được server. Kiểm tra mạng và thử lại.');}
  const value=await response.json();
  if(!response.ok){
    if(response.status===401&&route!=='login'){session=null;data=null;renderLogin();}
    throw Error(errors[value.error]??'Thao tác chưa thành công. Vui lòng thử lại.');
  }
  return value;
}
function notice(message){$('#notice').textContent=message;$('#notice').hidden=false;setTimeout(()=>{$('#notice').hidden=true;},5000);}
function bindForm(id,action){
  $(id).onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]'),label=button.textContent;
    button.disabled=true;button.textContent='Đang xử lý…';form.querySelector('.error').textContent='';
    try{await action(new FormData(form));}catch(error){form.querySelector('.error').textContent=error.message;}
    finally{button.disabled=false;button.textContent=label;}
  };
}
function renderLogin(){
  $('#app').innerHTML='<main class="login-shell" id="main"><div class="login"><div class="brand">TDH Relay<span>Không gian khách hàng</span></div><section class="panel"><h1>Quản lý relay của bạn</h1><p class="muted">Nhập key để xem thời hạn, thiết bị, thống kê và hướng dẫn cài đặt.</p><form id="key-form"><div class="field"><label for="customer-key">Key TDH Relay</label><div class="password-wrap"><input id="customer-key" name="key" type="password" required maxlength="100" autocomplete="off" spellcheck="false" autocapitalize="off"><button type="button" id="show-key" aria-label="Hiện key">Hiện</button></div></div><p class="error" role="alert"></p><button class="primary" type="submit">Vào trang khách hàng</button></form><div class="hint section-gap">Đăng nhập tại đây chưa bắt đầu tính ngày. Thời hạn chỉ bắt đầu khi thiết bị kích hoạt thành công lần đầu.</div></section><small>Key TDH do quản trị viên cấp. Không nhập mật khẩu hoặc token ChatGPT tại đây.</small><p class="section-gap"><a href="/">Xem hướng dẫn trước khi đăng nhập</a></p></div></main>';
  $('#show-key').onclick=()=>{const input=$('#customer-key');input.type=input.type==='password'?'text':'password';$('#show-key').textContent=input.type==='password'?'Hiện':'Ẩn';$('#show-key').setAttribute('aria-label',$('#show-key').textContent+' key');};
  bindForm('#key-form',async values=>{session=await api('login',{key:values.get('key')});$('#customer-key').value='';renderShell();await route();});
}
const navigation=[['overview','Key của tôi'],['devices','Thiết bị'],['statistics','Thống kê'],['setup','Cài đặt & hỗ trợ']];
function renderShell(){
  $('#app').innerHTML='<div class="shell customer-shell"><aside class="sidebar"><div class="brand">TDH Relay<span>Không gian khách hàng</span></div><nav class="nav" aria-label="Điều hướng">'+navigation.map(([id,label])=>'<a href="#'+id+'" data-nav="'+id+'">'+label+'</a>').join('')+'</nav><div class="sidebar-foot"><a href="/">Trang cài đặt công khai</a><button id="logout">Đăng xuất / đổi key</button></div></aside><main class="main" id="main"><div class="topbar"><span class="online"><span class="dot"></span>codex.tudonghoa.me</span><button id="refresh">Làm mới</button></div><div id="content" tabindex="-1"></div></main></div>';
  $('#logout').onclick=async()=>{try{await api('logout',{});session=null;data=null;renderLogin();}catch(error){notice(error.message);}};
  $('#refresh').onclick=route;
}
function heading(title,description,action=''){return '<div class="page-heading"><div><h1>'+title+'</h1><p>'+description+'</p></div>'+action+'</div>';}
function badge(status){return '<span class="badge '+(status==='revoked'?'bad':status==='pending'?'neutral':status==='expired'?'warn':'')+'">'+statusLabels[status]+'</span>';}
function metric(value,label,sub=''){return '<div class="stat"><p>'+label+'</p><strong>'+value+'</strong><small>'+sub+'</small></div>';}
async function route(){
  if(!session)return;const current=++generation,section=location.hash.slice(1)||'overview';
  document.querySelectorAll('[data-nav]').forEach(a=>{a.classList.toggle('active',a.dataset.nav===section);a.setAttribute('aria-current',a.dataset.nav===section?'page':'false');});
  $('#content').innerHTML='<div class="empty">Đang tải thông tin…</div>';
  try{
    const result=await api('summary');if(current!==generation||!session)return;data=result;
    if(section==='overview')overview();else if(section==='devices')devices();else if(section==='statistics')statistics();else if(section==='setup')setup();else location.hash='overview';
  }catch(error){if(session&&current===generation){$('#content').innerHTML='<section class="panel"><h2>Chưa tải được thông tin</h2><p class="error">'+esc(error.message)+'</p><button id="retry">Thử lại</button></section>';$('#retry').onclick=route;}}
}
function overview(){
  const l=data.license,pending=l.started_at===null,used=data.devices.filter(d=>!d.revoked).length;
  const statusText={pending:'Key đã sẵn sàng. Bạn chưa mất ngày sử dụng nào; hãy cài relay và kích hoạt bằng key để bắt đầu.',active:'Thời hạn được tính liên tục từ lần kích hoạt đầu tiên. Các thiết bị dùng chung ngày hết hạn.',expired:'Thời hạn đã kết thúc. Liên hệ nơi cấp key để gia hạn; thông tin thiết bị và hướng dẫn vẫn xem được tại đây.',revoked:'Key đã bị thu hồi. Liên hệ nơi cấp key để được kiểm tra.'}[l.status];
  $('#content').innerHTML=heading('Key của tôi','Thông tin cấp phép và các bước bắt đầu.','<a class="button primary" href="#setup">Hướng dẫn cài đặt</a>')+
    '<section class="panel"><div class="page-heading"><div><h2>'+esc(l.label)+'</h2><small class="mono break">Mã license: '+esc(l.id)+'</small></div>'+badge(l.status)+'</div><p>'+statusText+'</p><div class="grid"><div>'+[['Ngày cấp',date(l.created_at)],['Kích hoạt lần đầu',date(l.started_at)],['Hết hạn',pending?'Chưa tính thời hạn':date(l.expires_at)]].map(([name,value])=>'<div class="detail-line"><span>'+name+'</span><strong>'+value+'</strong></div>').join('')+'</div><div class="license-summary"><strong>'+num(pending?l.duration_ms/86400000:Math.max(0,Math.ceil((l.expires_at-data.now)/86400000)))+'</strong><span>'+ (pending?'ngày từ kích hoạt đầu tiên':'ngày còn lại, làm tròn lên')+'</span><small>'+used+' / '+l.max_devices+' thiết bị đang chiếm slot</small></div></div></section>'+
    '<div class="grid"><section class="panel"><h2>Thiết bị của bạn</h2><p>'+used+' thiết bị đã kích hoạt. Cài lại máy hoặc đổi thiết bị có thể cần quản trị viên reset slot.</p><a href="#devices">Xem thiết bị và lần liên hệ</a></section><section class="panel"><h2>Thống kê sử dụng</h2><p>'+(data.reports.length?'Đã có báo cáo chẩn đoán. Xem số request, lỗi và thời gian xử lý trong lần xuất gần nhất.':'Chưa có báo cáo. Bạn có thể xuất từ máy đã cài relay rồi chủ động tải lên để xem số liệu.')+'</p><a href="#statistics">Mở thống kê & tải báo cáo</a></section></div>'+
    '<div class="hint">Key TDH và tài khoản ChatGPT là hai thông tin riêng. Trang này không nhận mật khẩu, access token hoặc nội dung hội thoại của bạn.</div>';
}
function devices(){
  $('#content').innerHTML=heading('Thiết bị','Mỗi thiết bị được ràng buộc khi kích hoạt relay thành công.')+
    '<section class="panel flush"><div class="table-wrap"><table><thead><tr><th>Mã thiết bị</th><th>Trạng thái</th><th>Kích hoạt</th><th>Liên hệ gần nhất</th></tr></thead><tbody>'+data.devices.map(d=>'<tr><td class="mono">'+esc(d.fingerprint)+'</td><td><span class="badge '+(d.revoked?'bad':'')+'">'+(d.revoked?'Đã thu hồi':'Đã kích hoạt')+'</span></td><td>'+date(d.created_at)+'</td><td>'+date(d.last_seen)+'</td></tr>').join('')+'</tbody></table></div>'+(!data.devices.length?'<div class="empty"><strong>Chưa có thiết bị</strong>Cài relay và nhập key trên máy cần dùng để kích hoạt.</div>':'')+'</section>'+
    '<section class="panel"><h2>Đổi máy hoặc cài lại hệ điều hành</h2><p>Liên hệ nơi cấp key, cung cấp mã license và mã thiết bị cần reset. Reset thiết bị không bắt đầu lại thời hạn của key.</p><p class="muted">“Liên hệ gần nhất” là lần server cấp lease, không phải dấu hiệu chắc chắn máy đang trực tuyến. Không có tên máy hay địa chỉ IP trong danh sách này.</p><a class="button" href="#setup">Mở hướng dẫn cài đặt</a></section>';
}
function statistics(){
  const report=data.reports[0];
  $('#content').innerHTML=heading('Thống kê','Số liệu từ báo cáo bạn chủ động chia sẻ; không thu thập ngầm từ máy.')+
    (report?'<div class="stats">'+metric(num(report.requests),'Request trong báo cáo','Không phải số token hoặc quota')+metric(num(report.errors),'Request lỗi',report.requests?num(Math.round(report.errors/report.requests*10000)/100)+'% request':'Chưa có request')+metric(num(Math.round(report.avgDurationMs))+' ms','Thời gian trung bình','Theo bản ghi còn lưu trên máy')+metric(num(report.attempts),'Lượt thử upstream','Có thể gồm thử lại')+'</div><section class="panel"><h2>Báo cáo gần nhất</h2><p>Xuất lúc '+date(report.generatedAt)+' · Phiên bản '+esc(report.version)+' · '+(report.source==='customer_imported'?'Bạn tải lên':'Quản trị viên nhập')+'</p><div class="hint">Báo cáo thủ công, chưa xác thực với upstream. Không cộng dồn các lần tải lên vì các báo cáo có thể trùng khoảng dữ liệu.</div><div class="table-wrap section-gap"><table><thead><tr><th>Mã HTTP</th><th>Số request</th></tr></thead><tbody>'+Object.entries(report.statuses).map(([code,value])=>'<tr><td>'+esc(code)+'</td><td>'+num(value)+'</td></tr>').join('')+'</tbody></table></div></section>':'<section class="panel"><h2>Chưa có dữ liệu thống kê</h2><p>Xuất báo cáo trên máy đang chạy relay rồi tải file lên bên dưới. Khi chưa có báo cáo, trang không suy đoán mức sử dụng của bạn.</p></section>')+
    '<section class="panel"><h2>Tải báo cáo chẩn đoán</h2><ol class="steps"><li>Trên Windows đã cài relay, mở PowerShell và chạy lệnh dưới.</li><li>Mở file JSON được tạo trên Desktop để xem trước.</li><li>Chọn file và bấm “Tải báo cáo lên”. Bạn và quản trị viên sẽ xem được các chỉ số này.</li></ol>'+command('diagnostic','irm "https://codex.tudonghoa.me/diagnose.ps1" | iex')+
    '<form id="report-form" class="section-gap"><div class="field"><label for="report-file">File JSON do công cụ TDH xuất (tối đa 20 KB)</label><input id="report-file" type="file" name="file" accept=".json,application/json" required></div><p class="muted">Chỉ lưu phiên bản, thời gian, số request, mã HTTP và các chỉ số tổng hợp. Không tải file cấu hình, token hoặc nhật ký hội thoại.</p><p class="error" role="alert"></p><button type="submit" class="primary">Tải báo cáo lên</button></form></section>'+
    (data.reports.length?'<section class="panel"><h2>Lịch sử báo cáo</h2><ul class="metric-list">'+data.reports.map(r=>'<li><div>'+date(r.generatedAt)+'<br><small>Nhận lúc '+date(r.receivedAt)+'</small></div><span>'+num(r.requests)+' request · '+num(r.errors)+' lỗi</span></li>').join('')+'</ul></section>':'');
  bindCopy();bindForm('#report-form',async values=>{const file=values.get('file');if(file.size>20000)throw Error('File vượt quá 20 KB. Hãy chọn đúng file báo cáo TDH.');let report;try{report=JSON.parse(await file.text());}catch{throw Error('Không đọc được JSON trong file.');}await api('report',{report});notice('Đã nhận báo cáo.');await route();});
}
function command(id,text){return '<div class="command"><pre class="code" id="'+id+'">'+esc(text)+'</pre><button data-copy="'+id+'">Sao chép lệnh</button></div>';}
function bindCopy(){document.querySelectorAll('[data-copy]').forEach(button=>button.onclick=async()=>{try{await navigator.clipboard.writeText(document.getElementById(button.dataset.copy).textContent);notice('Đã sao chép lệnh.');}catch{notice('Clipboard chưa sẵn sàng. Bạn có thể chọn và sao chép lệnh trong ô.');}});}
function setup(){
  const proxy=platform==='proxy',mac=platform==='macos';
  $('#content').innerHTML=heading('Cài đặt & hỗ trợ','Chọn nơi dùng relay, làm theo từng bước rồi quay lại kiểm tra thiết bị.')+
    '<nav class="tabs" aria-label="Chọn nền tảng">'+[['windows','Windows / Codex'],['macos','macOS / Codex'],['proxy','Server / Sub2API']].map(([id,label])=>'<button data-platform="'+id+'" class="'+(id===platform?'primary':'')+'" aria-pressed="'+(id===platform)+'">'+label+'</button>').join('')+'</nav>'+
    '<section class="panel"><h2>'+(proxy?'Kết nối với Sub2API':'Cài TDH Relay trên '+(mac?'macOS':'Windows'))+'</h2>'+
    (proxy?'<p>Gói proxy chạy riêng trên server của bạn. Cần cấu hình license, tài khoản upstream và caller key rồi khai báo base URL trong Sub2API.</p><ol class="steps"><li>Tải gói proxy và kiểm tra checksum trong manifest.</li><li>Khởi tạo, kích hoạt license và chạy Docker Compose theo tài liệu.</li><li>Cấu hình tài khoản dành riêng cho proxy.</li><li>Thêm base URL và caller key vào kênh Sub2API.</li></ol><a class="button primary" href="/PROXY.md" target="_blank" rel="noopener">Mở hướng dẫn Sub2API</a><p class="muted section-gap">Bộ cài desktop không cài dịch vụ Sub2API. Dùng cả desktop và proxy sẽ cần đủ slot thiết bị.</p>':
    '<ol class="steps"><li>Cài <a href="https://developers.openai.com/codex/app/" target="_blank" rel="noopener">ứng dụng Codex từ OpenAI</a> nếu chưa có; dùng tài khoản ChatGPT của bạn.</li><li>Mở '+(mac?'Terminal':'PowerShell')+' và chạy lệnh cài bên dưới.</li><li>Nhập key TDH khi bộ cài hỏi. Kích hoạt thành công lần đầu sẽ bắt đầu thời hạn.</li><li>Đóng/mở lại Codex, đăng nhập ChatGPT và sử dụng.</li><li>Quay lại mục Thiết bị để kiểm tra kích hoạt.</li></ol>'+
    command('install',mac?'curl -fsSL "https://codex.tudonghoa.me/setup.sh" | bash':'irm "https://codex.tudonghoa.me/setup.ps1" | iex')+
    '<div class="hint section-gap">Lệnh này cài relay, runtime và cấu hình kết nối. Bạn vẫn cần ứng dụng Codex và tài khoản ChatGPT riêng.</div>'+
    (mac?'<p class="muted section-gap">Bộ cài hỗ trợ Intel và Apple Silicon; chưa kiểm thử cài/gỡ trên máy Mac thật.</p>':'')+
    '<details class="section-gap"><summary>Gỡ relay, khôi phục cấu hình</summary>'+command('remove',mac?'curl -fsSL "https://codex.tudonghoa.me/setup.sh?remove=1" | bash':'irm "https://codex.tudonghoa.me/setup.ps1?remove=1" | iex')+'<p>Gỡ relay không xóa tài khoản ChatGPT và không đặt lại thời hạn key.</p></details>')+'</section>'+
    '<div class="grid"><section class="panel"><h2>Kiểm tra khi gặp lỗi</h2><ul class="checklist"><li><strong>Không kích hoạt:</strong> xem trạng thái key và số máy tối đa tại Key của tôi.</li><li><strong>Đổi máy:</strong> liên hệ nơi cấp key để reset thiết bị cũ.</li><li><strong>HTTP 401:</strong> kiểm tra đăng nhập ChatGPT trong Codex.</li><li><strong>HTTP 429:</strong> kiểm tra giới hạn upstream; gia hạn key TDH không tăng quota ChatGPT.</li></ul><a href="#statistics">Tải báo cáo chẩn đoán để hỗ trợ</a></section><section class="panel"><h2>Dữ liệu của bạn</h2><p>Server TDH nhận thông tin cấp phép, định danh thiết bị và lần liên hệ. Với cấu hình desktop mặc định, yêu cầu mô hình đi trực tiếp từ relay trên máy đến OpenAI.</p><p>Chỉ số sử dụng chỉ lên trang này khi bạn hoặc quản trị viên nhập báo cáo. Không gửi mật khẩu, token hay nội dung hội thoại qua trang hỗ trợ.</p><a href="/README.md" target="_blank" rel="noopener">Đọc tài liệu desktop</a></section></div>';
  document.querySelectorAll('[data-platform]').forEach(button=>button.onclick=()=>{platform=button.dataset.platform;setup();});bindCopy();
}
window.addEventListener('hashchange',route);
try{session=await api('session');renderShell();await route();}catch{renderLogin();}

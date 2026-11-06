const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>value?new Date(value).toLocaleString('vi-VN'):'Chưa ghi nhận';
const num=value=>Number(value??0).toLocaleString('vi-VN');
const labels={term_started:'Bắt đầu thời hạn',license_batch_issued:'Cấp lô key',issued:'Cấp key',activated:'Kích hoạt máy',revoke:'Thu hồi key',extend:'Gia hạn',login:'Đăng nhập',logout:'Đăng xuất',login_failed:'Đăng nhập thất bại',password_changed:'Đổi mật khẩu',admin_provisioned:'Tạo quản trị viên',license_issued:'Cấp key trên web',license_update:'Sửa thông tin key',license_extend:'Gia hạn trên web',license_revoke:'Thu hồi trên web','revoke-device':'Thu hồi thiết bị','reset-device':'Reset thiết bị',diagnostic_imported:'Nhập báo cáo chẩn đoán'};
const errors={login_required:'Phiên đã hết hạn. Bạn vui lòng đăng nhập lại.',login_failed:'Tên đăng nhập hoặc mật khẩu không đúng.',login_rate_limited:'Đã có nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.',password_length:'Mật khẩu cần từ 14 đến 256 ký tự.',current_password_incorrect:'Mật khẩu hiện tại không đúng.',password_change_invalid:'Mật khẩu mới phải khác mật khẩu hiện tại.',device_limit_below_activated:'Giới hạn mới thấp hơn số máy đã kích hoạt. Hãy thu hồi thiết bị trước.',invalid_diagnostic:'Báo cáo không đúng định dạng TDH Relay.',password_change_required:'Bạn cần đổi mật khẩu trước khi tiếp tục.',record_not_found:'Không tìm thấy dữ liệu này.',csrf_rejected:'Phiên thao tác không hợp lệ. Hãy tải lại trang.',invalid_license_parameters:'Kiểm tra tên khách, số ngày và giới hạn thiết bị.',network:'Không kết nối được server. Kiểm tra mạng và thử lại.'};
let session=null,routeNumber=0,page=1,eventPage=1,filter={q:'',status:'all'};
async function api(route,data){
  let response;
  try{response=await fetch('/admin/api/'+route,{method:data===undefined?'GET':'POST',credentials:'same-origin',
    headers:data===undefined?{}:{'content-type':'application/json','x-csrf-token':session?.csrf??''},
    body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(15000)});}
  catch{throw Error(errors.network);}
  const result=await response.json();
  if(!response.ok){
    if(response.status===401&&route!=='login'){session=null;renderLogin();}
    throw Error(errors[result.error]??'Thao tác chưa thành công ('+(result.error??response.status)+').');
  }
  return result;
}
function notice(message){$('#notice').textContent=message;$('#notice').hidden=false;setTimeout(()=>{$('#notice').hidden=true;},5000);}
function badge(license){
  return license.revoked?'<span class="badge bad">Đã thu hồi</span>':license.started_at===null?'<span class="badge neutral">Chờ kích hoạt</span>':license.expires_at<=Date.now()?'<span class="badge neutral">Hết hạn</span>':license.expires_at<Date.now()+7*86400000?'<span class="badge warn">Sắp hết hạn</span>':'<span class="badge">Còn hạn</span>';
}
const expiry=license=>license.started_at===null?num(license.duration_ms/86400000)+' ngày từ kích hoạt':date(license.expires_at);
function closeDialog(){$('#dialog').close();$('#dialog-content').replaceChildren();}
function dialog(title,content){
  $('#dialog-content').innerHTML='<div class="dialog-head"><h2>'+escape(title)+'</h2><button type="button" id="close-dialog" aria-label="Đóng hộp thoại">Đóng</button></div>'+content;
  $('#close-dialog').onclick=closeDialog;
  if(!$('#dialog').open)$('#dialog').showModal();
}
$('#dialog').addEventListener('close',()=>$('#dialog-content').replaceChildren());
function bindForm(id,action){
  $(id).onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]'),original=button.textContent;
    button.disabled=true;button.textContent='Đang xử lý…';form.querySelector('.error').textContent='';
    try{await action(new FormData(form));}catch(error){form.querySelector('.error').textContent=error.message;}
    finally{button.disabled=false;button.textContent=original;}
  };
}
function passwordField(name,label,autocomplete='current-password'){
  return '<div class="field"><label for="'+name+'">'+label+'</label><div class="password-wrap"><input id="'+name+'" name="'+name+'" type="password" autocomplete="'+autocomplete+'" required maxlength="256"><button type="button" data-toggle="'+name+'" aria-label="Hiện mật khẩu">Hiện</button></div></div>';
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-toggle]');if(!button)return;
  const input=document.getElementById(button.dataset.toggle);input.type=input.type==='password'?'text':'password';
  button.textContent=input.type==='password'?'Hiện':'Ẩn';button.setAttribute('aria-label',button.textContent+' mật khẩu');
});
function renderLogin(){
  $('#app').innerHTML='<main class="login-shell" id="main"><div class="login"><div class="brand">TDH Relay<span>Quản trị sản phẩm</span></div><div class="panel"><h1>Đăng nhập quản trị</h1><p class="muted">Quản lý key, thiết bị và hoạt động cấp phép.</p><form id="login-form"><div class="field"><label for="username">Tên đăng nhập</label><input id="username" name="username" autocomplete="username" required maxlength="40"></div>'+passwordField('password','Mật khẩu')+'<p class="error" role="alert"></p><button class="primary" type="submit">Đăng nhập</button></form></div><small>Đây là tài khoản quản trị TDH Relay. Tài khoản ChatGPT và key khách hàng không dùng để đăng nhập tại đây.</small><p class="section-gap"><a href="/">Về trang cài đặt</a></p></div></main>';
  bindForm('#login-form',async values=>{session=await api('login',Object.fromEntries(values));renderShell();await renderRoute();});
}
const navigation=[['overview','Tổng quan'],['licenses','Key & khách hàng'],['events','Nhật ký'],['diagnostics','Chẩn đoán'],['install','Cài đặt & tích hợp'],['security','Tài khoản']];
function renderShell(){
  $('#app').innerHTML='<div class="shell"><aside class="sidebar"><div class="brand">TDH Relay<span>Quản trị sản phẩm</span></div><nav class="nav" aria-label="Điều hướng">'+navigation.map(([key,title])=>'<a href="#'+key+'" data-nav="'+key+'">'+title+'</a>').join('')+'</nav><div class="sidebar-foot"><span>Quản trị: <strong>'+escape(session.username)+'</strong></span><a href="/" target="_blank" rel="noopener">Mở trang cài đặt</a><button id="logout">Đăng xuất</button></div></aside><main class="main" id="main"><div class="topbar"><span class="online"><span class="dot"></span>codex.tudonghoa.me</span><span class="stamp">Thời gian hiển thị theo trình duyệt</span></div><div id="content" tabindex="-1"></div></main></div>';
  $('#logout').onclick=async()=>{try{await api('logout',{});session=null;renderLogin();}catch(error){notice(error.message);}};
}
function heading(title,description,action=''){return '<div class="page-heading"><div><h1>'+title+'</h1><p>'+description+'</p></div>'+action+'</div>';}
async function renderRoute(){
  if(!session)return;
  const generation=++routeNumber;
  const parts=location.hash.slice(1).split('/'),route=session.mustChange?'security':parts[0]||'overview';
  document.querySelectorAll('[data-nav]').forEach(a=>{a.classList.toggle('active',a.dataset.nav===route);a.setAttribute('aria-current',a.dataset.nav===route?'page':'false');});
  const content=$('#content');if(!content)return;content.innerHTML='<div class="empty">Đang tải dữ liệu…</div>';
  try{
    if(route==='overview'){const data=await api('overview');if(generation===routeNumber)overview(data);}
    else if(route==='licenses'&&parts[1]){const data=await api('licenses/'+encodeURIComponent(parts[1]));if(generation===routeNumber)detail(data);}
    else if(route==='licenses'){const data=await api('licenses?'+new URLSearchParams({...filter,page}));if(generation===routeNumber)licenses(data);}
    else if(route==='events'){const data=await api('events?page='+eventPage);if(generation===routeNumber)events(data);}
    else if(route==='diagnostics'){const data=await api('diagnostics');if(generation===routeNumber)diagnostics(data);}
    else if(route==='security')security();
    else if(route==='install')install();
    else{location.hash='overview';return;}
  }catch(error){if($('#content')&&generation===routeNumber){content.innerHTML='<div class="panel"><h2>Chưa tải được dữ liệu</h2><p class="error">'+escape(error.message)+'</p><button id="retry">Thử lại</button></div>';$('#retry').onclick=renderRoute;}}
}
function overview(data){
  const {counts,devices}=data;
  $('#content').innerHTML=heading('Tổng quan','Theo dõi key và hoạt động cấp phép.','<button class="primary" id="issue">Cấp key mới</button>')+
    '<div class="stats">'+[[counts.active,'Key còn hạn',num(counts.pending)+' key chờ kích hoạt'],[counts.expiring,'Hết hạn trong 7 ngày','Cần kiểm tra để gia hạn'],[devices.recent,'Thiết bị vừa liên hệ','Trong 10 phút gần đây'],[counts.revoked,'Key đã thu hồi',num(counts.expired)+' key hết hạn']].map(([value,label,sub])=>'<div class="stat"><p>'+label+'</p><strong>'+num(value)+'</strong><small>'+sub+'</small></div>').join('')+'</div>'+
    '<div class="grid"><section class="panel"><h2>Cấp key & kích hoạt</h2><p class="muted">14 ngày gần nhất · ngày UTC · dữ liệu cấp phép</p><div id="activity-chart"></div><small>Số lượt cấp key và kích hoạt thiết bị mới; không phải lượt gọi mô hình.</small></section><section class="panel"><h2>Sắp hết hạn</h2>'+(data.expiring.length?'<ul class="metric-list">'+data.expiring.map(row=>'<li><div><a href="#licenses/'+row.id+'">'+escape(row.label)+'</a><br><small>'+date(row.expires_at)+'</small></div><span class="badge warn">≤ 7 ngày</span></li>').join('')+'</ul>':'<div class="empty"><strong>Chưa có key sắp hết hạn</strong>Key còn dưới 7 ngày sẽ xuất hiện tại đây.</div>')+'</section></div>'+
    '<section class="panel"><h2>Phạm vi số liệu</h2><p>Server ghi nhận license, thiết bị và lần liên hệ gần nhất. Request, token và lỗi xử lý trên máy khách vẫn lưu tại máy khách.</p><a href="#diagnostics">Mở chẩn đoán và hướng dẫn lấy báo cáo</a></section>';
  $('#issue').onclick=issue;
  const values=Array.from({length:14},(_,i)=>{const day=new Date(data.now-(13-i)*86400000).toISOString().slice(0,10);return {day,n:data.activity.filter(x=>x.day===day&&['issued','activated'].includes(x.kind)).reduce((s,x)=>s+x.count,0)};});
  const max=Math.max(1,...values.map(x=>x.n));
  $('#activity-chart').innerHTML='<svg class="chart" viewBox="0 0 560 200" role="img" aria-label="Số lượt cấp key và kích hoạt mỗi ngày"><line x1="10" y1="160" x2="550" y2="160"/>'+values.map((item,i)=>{
    const height=item.n/max*120,x=14+i*38;return '<g><title>'+item.day+': '+item.n+' lượt</title><rect x="'+x+'" y="'+(160-height)+'" width="24" height="'+height+'" rx="3"/><text x="'+(x+12)+'" y="'+(150-height)+'" text-anchor="middle">'+item.n+'</text><text x="'+(x+12)+'" y="183" text-anchor="middle">'+item.day.slice(8)+'</text></g>';
  }).join('')+'</svg><details><summary>Xem số liệu theo ngày</summary><ul>'+values.map(x=>'<li>'+x.day+': '+x.n+' lượt</li>').join('')+'</ul></details>';
}
function pager(data,id){return '<div class="pagination"><span>'+num(data.total)+' bản ghi · trang '+data.page+'/'+Math.max(1,Math.ceil(data.total/data.limit))+'</span><div class="actions"><button id="'+id+'-prev" '+(data.page<=1?'disabled':'')+'>Trước</button><button id="'+id+'-next" '+(data.page*data.limit>=data.total?'disabled':'')+'>Sau</button></div></div>';}
function licenses(data){
  $('#content').innerHTML=heading('Key & khách hàng','Quản lý thời hạn, số máy và trạng thái kích hoạt.','<button class="primary" id="issue">Cấp key mới</button>')+
    '<form class="toolbar" id="filters"><div class="search"><label for="q">Tìm khách hoặc mã license</label><input id="q" name="q" value="'+escape(filter.q)+'" maxlength="120" placeholder="Nhập tên khách…"></div><div class="filter"><label for="status">Trạng thái</label><select id="status" name="status">'+[['all','Tất cả'],['pending','Chờ kích hoạt'],['active','Còn hạn'],['expiring','Sắp hết hạn'],['expired','Hết hạn'],['revoked','Đã thu hồi']].map(([value,label])=>'<option value="'+value+'" '+(filter.status===value?'selected':'')+'>'+label+'</option>').join('')+'</select></div><button type="submit">Lọc danh sách</button></form>'+
    '<section class="panel flush"><div class="table-wrap"><table><thead><tr><th>Khách hàng</th><th>Trạng thái</th><th>Hết hạn</th><th>Thiết bị</th><th>Liên hệ gần nhất</th><th></th></tr></thead><tbody>'+data.rows.map(row=>'<tr><td><strong>'+escape(row.label)+'</strong><small class="mono">'+row.id.slice(0,8)+'</small></td><td>'+badge(row)+'</td><td>'+expiry(row)+'</td><td>'+row.devices+' / '+row.max_devices+'</td><td>'+date(row.last_seen)+'</td><td><a class="button" href="#licenses/'+row.id+'">Chi tiết</a></td></tr>').join('')+'</tbody></table></div>'+(!data.rows.length?'<div class="empty"><strong>Chưa có key phù hợp</strong>Thay bộ lọc hoặc cấp key đầu tiên cho khách.</div>':'')+pager(data,'licenses')+'</section>';
  $('#filters').onsubmit=e=>{e.preventDefault();filter=Object.fromEntries(new FormData(e.currentTarget));page=1;renderRoute();};
  $('#issue').onclick=issue;$('#licenses-prev').onclick=()=>{page--;renderRoute();};$('#licenses-next').onclick=()=>{page++;renderRoute();};
}
function issue(){
  dialog('Cấp key mới','<form id="issue-form"><div class="field"><label for="label">Tên khách / tên lô key</label><input id="label" name="label" required maxlength="110" autofocus><small>Cấp nhiều key sẽ tự thêm số thứ tự 001, 002…</small></div><div class="field"><label for="count">Số lượng key</label><input id="count" name="count" type="number" min="1" max="100" value="1" required></div><div class="form-grid"><div class="field"><label for="days">Số ngày sử dụng</label><input id="days" name="days" type="number" min="1" max="3660" value="30" required></div><div class="field"><label for="maxDevices">Số máy tối đa mỗi key</label><input id="maxDevices" name="maxDevices" type="number" min="1" max="100" value="1" required></div></div><div class="hint">Thời hạn bắt đầu khi thiết bị kích hoạt thành công lần đầu. Tạo key hoặc đăng nhập trang khách hàng chưa tính ngày. Key chỉ hiển thị một lần sau khi tạo.</div><p class="error" role="alert"></p><div class="dialog-actions"><button class="primary" type="submit">Tạo key</button></div></form>');
  bindForm('#issue-form',async values=>{
    const input={label:values.get('label'),days:Number(values.get('days')),maxDevices:Number(values.get('maxDevices'))},count=Number(values.get('count'));
    const rows=count===1?[await api('licenses',input)]:(await api('licenses/batch',{...input,count})).licenses;
    dialog(count===1?'Đã cấp key cho '+rows[0].label:'Đã cấp '+rows.length+' key',
      '<p><strong>'+num(input.days)+' ngày từ lần kích hoạt đầu tiên</strong> · tối đa '+input.maxDevices+' máy mỗi key</p>'+
      (count===1?'<div class="key-box">'+escape(rows[0].key)+'</div>':'<div class="table-wrap batch-keys"><table><thead><tr><th>Tên</th><th>Key</th></tr></thead><tbody>'+rows.map(row=>'<tr><td>'+escape(row.label)+'</td><td class="mono">'+escape(row.key)+'</td></tr>').join('')+'</tbody></table></div>')+
      '<div class="hint warn">Tải CSV hoặc sao chép trước khi đóng. Server chỉ lưu hash, không thể hiển thị lại key. File CSV chứa key: chỉ gửi đúng dòng của từng khách.</div><div class="actions"><button class="primary" id="copy-key">'+(count===1?'Sao chép key':'Sao chép tất cả')+'</button><button id="download-keys">Tải CSV</button>'+(count===1?'<a class="button" href="#licenses/'+rows[0].id+'" id="view-key">Xem license</a>':'')+'</div>');
    $('#copy-key').onclick=async()=>{try{await navigator.clipboard.writeText(rows.map(r=>count===1?r.key:r.label+'\t'+r.key).join('\n'));notice('Đã sao chép key.');}catch{notice('Không truy cập được clipboard. Hãy tải CSV hoặc chọn và sao chép key trong ô.');}};
    $('#download-keys').onclick=()=>{
      const cell=value=>'"'+String(/^[=+@\-\t\r\n]/.test(String(value))?"'"+value:value).replaceAll('"','""')+'"';
      const data=[['Tên','Key','Số ngày từ kích hoạt','Số máy','Mã license'],...rows.map(r=>[r.label,r.key,input.days,r.maxDevices,r.id])].map(row=>row.map(cell).join(',')).join('\r\n');
      const url=URL.createObjectURL(new Blob(['\uFEFF'+data],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');
      link.href=url;link.download='tdh-keys-'+new Date().toISOString().slice(0,10)+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    if($('#view-key'))$('#view-key').onclick=closeDialog;await renderRoute();
  });
}
function detail({license:l,devices,events:log,reports}){
  $('#content').innerHTML='<p><a href="#licenses">← Danh sách key</a></p>'+heading(escape(l.label),'Mã license: '+escape(l.id),'<div class="actions"><button id="edit-license">Sửa thông tin</button><button class="primary" id="extend">Gia hạn</button><button class="danger" id="revoke" '+(l.revoked?'disabled':'')+'>Thu hồi key</button></div>')+
    '<section class="panel"><div class="grid"><div>'+[['Trạng thái',badge(l)],['Hết hạn',expiry(l)],['Kích hoạt lần đầu',date(l.started_at)],['Ngày cấp',date(l.created_at)]].map(([k,v])=>'<div class="detail-line"><span>'+k+'</span><strong>'+v+'</strong></div>').join('')+'</div><div><div class="detail-line"><span>Số máy đang chiếm slot</span><strong>'+devices.filter(d=>!d.revoked).length+' / '+l.max_devices+'</strong></div><p class="muted section-gap">Thu hồi chặn gia hạn lease. Máy đang dùng lease cũ có thể tiếp tục tối đa 10 phút.</p></div></div></section>'+
    '<section class="panel flush"><div class="panel-heading"><h2>Thiết bị đã kích hoạt</h2><p class="muted">Reset giải phóng ràng buộc để khách kích hoạt lại.</p></div><div class="table-wrap"><table><thead><tr><th>Thiết bị</th><th>Trạng thái</th><th>Liên hệ gần nhất</th><th>Thao tác</th></tr></thead><tbody>'+devices.map(d=>'<tr><td class="mono">'+d.device_id.slice(0,16)+'<small>'+d.id.slice(0,8)+'</small></td><td><span class="badge '+(d.revoked?'bad':'')+'">'+(d.revoked?'Đã thu hồi':'Đã kích hoạt')+'</span></td><td>'+date(d.last_seen)+'</td><td><div class="actions"><button data-device="'+d.id+'" data-action="reset-device">Reset</button><button class="danger" data-device="'+d.id+'" data-action="revoke-device" '+(d.revoked?'disabled':'')+'>Thu hồi</button></div></td></tr>').join('')+'</tbody></table></div>'+(!devices.length?'<div class="empty">Chưa có thiết bị kích hoạt key này.</div>':'')+'</section>'+
    '<section class="panel"><div class="page-heading"><div><h2>Báo cáo chẩn đoán</h2><p>Khách chủ động xuất và tải lên trang khách hàng, hoặc bạn nhập file để kiểm tra. Đây là số liệu tự khai từ máy khách.</p></div><button id="import-report">Nhập báo cáo JSON</button></div>'+reports.map(r=>'<details class="section-gap"><summary>'+date(r.at)+' · '+escape(r.report.version)+' · '+num(r.report.requests)+' request</summary><div class="hint">Báo cáo thủ công, chưa xác thực với upstream. Tạo lúc '+date(r.report.generatedAt)+'.</div><ul class="metric-list"><li>Request lỗi <strong>'+num(r.report.errors)+'</strong></li><li>Thời gian trung bình <strong>'+num(Math.round(r.report.avgDurationMs))+' ms</strong></li><li>Lượt thử upstream <strong>'+num(r.report.attempts)+'</strong></li><li>License tại thời điểm xuất <strong>'+(r.report.licenseActive?'Còn lease':'Không có lease hợp lệ')+'</strong></li></ul><pre class="code">'+escape(JSON.stringify(r.report.statuses,null,2))+'</pre></details>').join('')+(!reports.length?'<p class="muted">Chưa có báo cáo. Xem trang Chẩn đoán để lấy lệnh xuất trên máy khách.</p>':'')+'</section>'+
    '<section class="panel"><h2>Lịch sử cấp phép</h2><ul class="metric-list">'+log.map(e=>'<li><span>'+escape(labels[e.kind]??e.kind)+'</span><small>'+date(e.at)+'</small></li>').join('')+'</ul></section>';
  $('#extend').onclick=()=>{
    dialog('Gia hạn '+l.label,'<form id="extend-form"><div class="field"><label for="extra-days">Thêm số ngày</label><input id="extra-days" name="days" type="number" min="1" max="3660" value="30" required></div><div class="hint">Key chưa kích hoạt: cộng thêm ngày sử dụng, chưa bắt đầu tính hạn. Key đã dùng: cộng từ ngày hết hạn hoặc hiện tại, chọn mốc muộn hơn. Gia hạn cũng mở lại key đã thu hồi.</div><p class="error" role="alert"></p><div class="dialog-actions"><button class="primary" type="submit">Xác nhận gia hạn</button></div></form>');
    bindForm('#extend-form',async v=>{await api('licenses/'+l.id+'/extend',{days:Number(v.get('days'))});closeDialog();notice('Đã gia hạn key.');await renderRoute();});
  };
  $('#revoke').onclick=()=>confirmAction('Thu hồi key của '+l.label+'?','Toàn bộ thiết bị của key này sẽ bị chặn khi gia hạn lease.','licenses/'+l.id+'/revoke');
  $('#edit-license').onclick=()=>{
    dialog('Sửa thông tin','<form id="edit-form"><div class="field"><label for="edit-label">Tên khách</label><input id="edit-label" name="label" value="'+escape(l.label)+'" maxlength="120" required></div><div class="field"><label for="edit-limit">Giới hạn thiết bị</label><input id="edit-limit" name="maxDevices" type="number" min="1" max="100" value="'+l.max_devices+'" required></div><p class="error" role="alert"></p><div class="dialog-actions"><button class="primary" type="submit">Lưu thay đổi</button></div></form>');
    bindForm('#edit-form',async v=>{await api('licenses/'+l.id+'/update',{label:v.get('label'),maxDevices:Number(v.get('maxDevices'))});closeDialog();notice('Đã cập nhật thông tin.');await renderRoute();});
  };
  document.querySelectorAll('[data-device]').forEach(b=>b.onclick=()=>confirmAction(b.dataset.action==='reset-device'?'Reset thiết bị này?':'Thu hồi thiết bị này?',b.dataset.action==='reset-device'?'Ràng buộc hiện tại sẽ bị xóa; khách có thể kích hoạt lại bằng key.':'Khóa thiết bị cũ sẽ bị chặn và giải phóng một slot.','devices/'+b.dataset.device+'/'+b.dataset.action));
  $('#import-report').onclick=()=>{
    dialog('Nhập báo cáo chẩn đoán','<form id="report-form"><div class="field"><label for="report-file">File JSON do công cụ TDH xuất</label><input class="file-input" id="report-file" name="file" type="file" accept=".json,application/json" required></div><p class="muted">Chỉ giữ các chỉ số đã định nghĩa; không lưu nội dung file gốc.</p><p class="error" role="alert"></p><div class="dialog-actions"><button class="primary" type="submit">Nhập báo cáo</button></div></form>');
    bindForm('#report-form',async v=>{const f=v.get('file');if(f.size>20000)throw Error('File quá lớn. Chỉ nhận tối đa 20 KB.');let report;try{report=JSON.parse(await f.text());}catch{throw Error('File JSON không hợp lệ.');}await api('licenses/'+l.id+'/report',{report});closeDialog();notice('Đã nhập báo cáo.');await renderRoute();});
  };
}
function confirmAction(title,description,route){
  dialog(title,'<form id="confirm-form"><p>'+escape(description)+'</p><p class="error" role="alert"></p><div class="dialog-actions"><button type="button" id="cancel-action">Hủy</button><button class="danger" type="submit">Xác nhận</button></div></form>');
  $('#cancel-action').onclick=closeDialog;bindForm('#confirm-form',async()=>{await api(route,{});closeDialog();notice('Đã cập nhật.');await renderRoute();});
}
function events(data){
  $('#content').innerHTML=heading('Nhật ký','Lịch sử cấp phép và thao tác của quản trị viên.')+'<section class="panel flush"><div class="table-wrap"><table><thead><tr><th>Thời điểm</th><th>Thao tác</th><th>Người thực hiện</th><th>Đối tượng</th></tr></thead><tbody>'+data.rows.map(r=>'<tr><td>'+date(r.at)+'</td><td>'+escape(labels[r.kind]??r.kind)+'</td><td>'+escape(r.actor)+'</td><td class="mono">'+(r.target?'<a href="#licenses/'+encodeURIComponent(r.target)+'">'+escape(r.target.slice(0,8))+'</a>':'—')+'</td></tr>').join('')+'</tbody></table></div>'+pager(data,'events')+'</section>';
  $('#events-prev').onclick=()=>{eventPage--;renderRoute();};$('#events-next').onclick=()=>{eventPage++;renderRoute();};
}
function diagnostics(data){
  $('#content').innerHTML=heading('Chẩn đoán','Kiểm tra dịch vụ và đọc báo cáo được khách chủ động chia sẻ.','<button id="refresh">Kiểm tra lại</button>')+
    '<div class="grid"><section class="panel"><h2>Trạng thái hệ thống</h2><ul class="metric-list"><li>Database cấp phép <span class="badge '+(data.database?'':'bad')+'">'+(data.database?'Hoạt động':'Cần kiểm tra')+'</span></li>'+data.services.map(s=>'<li>'+escape(s.name)+'<span class="badge '+(s.ok?'':'bad')+'">'+(s.ok?'Hoạt động · '+s.durationMs+' ms':'Không phản hồi')+'</span></li>').join('')+'<li>Thời hạn lease tối đa <strong>'+data.leaseMinutes+' phút</strong></li><li>Báo cáo đã nhập <strong>'+num(data.reportCount)+'</strong></li></ul><small>Kiểm tra lúc '+date(data.now)+'</small></section>'+
    '<section class="panel"><h2>Lấy báo cáo từ máy Windows</h2><p>Khách chạy lệnh dưới đây trên máy đã cài relay. Công cụ tạo file JSON tại Desktop và hiển thị đường dẫn.</p><pre class="code">irm "https://codex.tudonghoa.me/diagnose.ps1" | iex</pre><p class="muted">Không tự gửi dữ liệu. Khách xem file rồi gửi riêng cho bạn; nhập tại trang chi tiết key.</p></section></div>'+
    '<section class="panel"><h2>Kiểm tra nhanh theo triệu chứng</h2><ul class="checklist"><li><strong>Không kích hoạt:</strong> kiểm tra hạn key, trạng thái thu hồi và số slot thiết bị.</li><li><strong>Cài lại Windows / đổi máy:</strong> xác minh khách rồi reset thiết bị cũ trong chi tiết key.</li><li><strong>HTTP 401:</strong> mở Codex và đăng nhập lại tài khoản ChatGPT. Gia hạn key TDH không sửa phiên ChatGPT.</li><li><strong>HTTP 429:</strong> kiểm tra giới hạn upstream; số request không tự chứng minh tiết kiệm quota.</li><li><strong>Request lỗi / chậm:</strong> đối chiếu thời điểm báo cáo, trạng thái mạng và mã HTTP; thống kê desktop chỉ gồm bản ghi còn lưu tại máy.</li></ul><div class="hint">Chưa thu thập telemetry tự động. Không có token, prompt hoặc nội dung phản hồi trong báo cáo TDH.</div></section>';
  $('#refresh').onclick=renderRoute;
}
function install(){
  $('#content').innerHTML=heading('Cài đặt & tích hợp','Chọn theo nơi bạn muốn relay hoạt động.')+
    '<div class="grid"><section class="panel"><span class="install-kind">Máy cá nhân · Windows</span><h2>Dùng cùng ứng dụng Codex</h2><ol class="steps"><li>Cài ứng dụng Codex từ OpenAI nếu chưa có.</li><li>Mở PowerShell, chạy lệnh dưới và nhập key TDH.</li><li>Đóng/mở lại Codex; đăng nhập ChatGPT nếu chưa đăng nhập.</li><li>Dùng Codex như bình thường. Relay tự chạy cùng Windows.</li></ol><pre class="code">irm "https://codex.tudonghoa.me/setup.ps1" | iex</pre><p class="muted">Lệnh cài relay, runtime và cấu hình kết nối. Không cài ứng dụng Codex hoặc Sub2API; không cấp tài khoản ChatGPT.</p><a href="/" target="_blank" rel="noopener">Hướng dẫn cài/gỡ cho khách</a></section>'+
    '<section class="panel"><span class="install-kind">Server · Docker</span><h2>Tích hợp vào Sub2API</h2><p>Triển khai gói proxy riêng trên server, kích hoạt license, thiết lập pool tài khoản và caller key. Sau đó khai báo base URL của relay trong Sub2API.</p><div class="hint">Không chạy setup.ps1 trên máy cá nhân để thay thế triển khai proxy server.</div><p>Phiên đăng nhập dùng cho proxy cần được quản lý riêng; không chia sẻ refresh token đang được Codex trên máy khách gia hạn.</p><a class="button" href="/PROXY.md" target="_blank" rel="noopener">Mở tài liệu Sub2API</a></section></div>';
}
function security(){
  $('#content').innerHTML=heading(session.mustChange?'Đổi mật khẩu lần đầu':'Tài khoản quản trị','Đổi mật khẩu sẽ kết thúc mọi phiên quản trị, kể cả phiên hiện tại.')+
    '<section class="panel wide">'+(session.mustChange?'<div class="hint warn">Mật khẩu bàn giao chỉ dùng để đăng nhập ban đầu. Bạn cần đặt mật khẩu riêng trước khi quản trị key.</div>':'')+
    '<form id="password-form">'+passwordField('current','Mật khẩu hiện tại')+passwordField('new-password','Mật khẩu mới','new-password')+passwordField('confirm-password','Nhập lại mật khẩu mới','new-password')+'<small>Ít nhất 14 ký tự. Có thể dùng một cụm từ dài, riêng cho trang quản trị này.</small><p class="error" role="alert"></p><button class="primary section-gap" type="submit">Đổi mật khẩu & đăng nhập lại</button></form></section>';
  bindForm('#password-form',async v=>{
    if(v.get('new-password')!==v.get('confirm-password'))throw Error('Hai mật khẩu mới chưa khớp.');
    await api('password',{current:v.get('current'),password:v.get('new-password')});session=null;renderLogin();notice('Đã đổi mật khẩu. Bạn hãy đăng nhập lại.');
  });
}
window.addEventListener('hashchange',()=>{closeDialog();renderRoute();});
try{session=await api('session');renderShell();await renderRoute();}catch{renderLogin();}

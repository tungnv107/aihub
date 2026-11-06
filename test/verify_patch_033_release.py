"""Build publish-gate metadata from the completed 0.3.3 verification reports."""
import json,pathlib,re
root=pathlib.Path(__file__).resolve().parent.parent
directory=root/'artifacts/product-0.3.3'
build=json.loads((directory/'build.json').read_text())
bundle=json.loads((directory/'bundle-test.json').read_text())
windows=json.loads((directory/'windows-install.json').read_text(encoding='utf-8-sig'))
suite=(root/'artifacts/product-033-tests-final.tap').read_text(encoding='utf-8-sig')
def count(label):
    found=re.findall(r'(?m)^.*?\b'+label+r' (\d+)\s*$',suite)
    assert len(found)==1,label
    return int(found[0])
assert build['version']==bundle['version']==windows['version']=='0.3.3'
assert count('tests')==count('pass')==341 and count('fail')==count('cancelled')==0
assert bundle['passed'] and bundle['signedBundleConfigRecovery'] and bundle['tamperRejected']
assert bundle['activationPreserved'] and bundle['expiryPreserved'] and bundle['authUnchanged']
assert windows['result']=='passed' and windows['previous_version']=='0.3.2'
for key in ['activation_preserved','reset_to_direct_recovered','conflict_rollback_verified',
            'config_restored_exactly','auth_unchanged','real_codex_config_unchanged','install','reinstall','uninstall']:
    assert windows[key] is True,key
report={'version':'0.3.3','regression_suite':True,'tests':341,
        'signed_bundle_config_recovery':True,'windows_upgrade_032_to_033':True,
        'license_activation_preserved':True,'config_credentials_preserved':True,
        'direct_reset_recovered':True,'conflict_rollback_verified':True,
        'windows_powershell':windows['windows_powershell'],
        'node_download_retested':False,'autostart_retested':False,
        'macos_native_install':'not_tested_no_mac_host','quota_parity':'not_proven'}
(directory/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))

// Adapter for the pinned ESP Web Tools 10.4.0 dialog. Its post-flash initialize
// hook runs after the loader releases USB and the dialog reopens it. Close via
// the normal lifecycle so our clock writer never shares a port with the loader.
// Keep these hooks covered when changing the pinned dependency in index.html.
import {checkFlashCapacity} from './hardware-check.js';

export function clockInstallDialogClass(Base){
  for(const method of ['_initialize','_startInstall','_closeDialog'])
    if(typeof Base.prototype[method]!=='function')throw new Error('USB installer integration changed. Reload or contact support.');
  return class extends Base{
    installMode='update';
    autoClock=true;
    autoTheme=false;
    onFirmwareInstalled=()=>{};
    _installReported=false;
    // Writing completion remains true even if the subsequent USB reopen fails.
    // That is a clock handoff problem, not a failed firmware write.
    get installSucceeded(){return this._installState?.state==='finished';}
    get installError(){return this._installState?.state==='error'?this._installState.message:this._state==='ERROR'?this._error:'';}
    _reportInstall(){if(this.installSucceeded&&!this._installReported){this._installReported=true;try{this.onFirmwareInstalled();}catch{ /* Counter failures must never affect USB. */ }}}
    _startInstall(){this._installReported=false;super._startInstall(this.installMode==='factory');}
    _closeDialog(){this._reportInstall();return super._closeDialog();}
    async _initialize(justInstalled=false){
      try{await super._initialize(justInstalled);}finally{if(justInstalled)this._reportInstall();}
      if(this._manifest){
        if(!this.expectedManifest||JSON.stringify(this._manifest)!==JSON.stringify(this.expectedManifest)){
          this._state='ERROR';
          this._error='The installer manifest changed after verification. Reload this page before installing.';
          return;
        }
        this._manifest.beforeFlash=loader=>checkFlashCapacity(loader,this.expectedFlashMB,this.boardName);
      }
      // This page already selected Update or Fresh installation. Avoid a
      // contradictory second erase chooser; _startInstall enforces that mode.
      // Published manifests still ask when opened in a generic installer.
      if(this._manifest)this._manifest.new_install_prompt_erase=false;
      if(justInstalled&&this._state!=='ERROR'&&this.installSucceeded&&(this.autoClock||this.autoTheme)){
        await this.updateComplete;
        this._closeDialog();
      }
    }
  };
}

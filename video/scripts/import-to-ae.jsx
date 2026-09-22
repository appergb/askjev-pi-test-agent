// After Effects: File > Scripts > Run Script File. Choose the rendered MP4.
// Creates editable scene compositions and a master timeline; does not overwrite projects.
(function () {
  var footageFile = File.openDialog('选择 askjev-agent-intro-1080p.mp4');
  if (!footageFile) return;
  if (!app.project) app.newProject();
  app.beginUndoGroup('Import askJEV introduction');
  try {
    var folder = app.project.items.addFolder('askJEV Agent / 60s');
    var footage = app.project.importFile(new ImportOptions(footageFile));
    footage.parentFolder = folder;
    var master = app.project.items.addComp('askJEV Agent — Master', 1920, 1080, 1, 60, 30);
    master.parentFolder = folder;
    var titles = ['从怀疑到证据', '可追溯流程', '真实样例', '持续测试', '云端推理', '安装技能'];
    for (var i = 0; i < titles.length; i++) {
      var scene = app.project.items.addComp(('0' + (i + 1)) + ' — ' + titles[i], 1920, 1080, 1, 10, 30);
      scene.parentFolder = folder;
      var clip = scene.layers.add(footage);
      clip.startTime = -i * 10;
      clip.inPoint = 0;
      clip.outPoint = 10;
      clip.name = 'Remotion 基础画面与声音';
      var overlay = scene.layers.addText('可在此添加 AE 后期标题');
      overlay.enabled = false;
      overlay.name = '可编辑标题（默认隐藏）';
      var layer = master.layers.add(scene);
      layer.startTime = i * 10;
      layer.inPoint = i * 10;
      layer.outPoint = (i + 1) * 10;
      master.markerProperty.setValueAtTime(i * 10, new MarkerValue(titles[i]));
    }
    master.openInViewer();
  } finally { app.endUndoGroup(); }
})();

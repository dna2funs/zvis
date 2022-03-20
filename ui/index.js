'use strict';

(function () {

function $(selector) { return document.querySelector(selector); }
function on(elem, name, cb) { return elem.addEventListener(name, cb); }
function _urlencode(data) {
   return '?' + Object.keys(data).filter(function (key) {
      return key && data[key];
   }).map(function (key) {
      return (
         encodeURIComponent(key) + '=' +
         encodeURIComponent(data[key])
      );
   }).join('&');
}
function ajax(options) {
   return new Promise(function (r, e) {
      var xhr = new XMLHttpRequest(), payload = null;
      xhr.open(options.method || 'POST', options.url + (options.data ? _uriencode(options.data) : ''), true);
      xhr.addEventListener('readystatechange', function (evt) {
         if (evt.target.readyState === 4 /*XMLHttpRequest.DONE*/) {
            if (~~(evt.target.status / 100) === 2) {
               r(evt.target.response);
            } else {
               e(evt.target.status);
            }
         }
      });
      if (options.json) {
         xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
         payload = JSON.stringify(options.json);
      }
      xhr.send(payload);
   });
}

var constant = {
   regex: {
      integer: /^[0-9]+$/,
      float: /^[0-9]*\.[0-9]+$/ // not support sth like 1e-3
   }
};

var data = {
   nodes: new vis.DataSet([]),
   edges: new vis.DataSet([]),
   table: [
      ['', ''], ['', ''], ['', ''], ['', ''], ['', ''],
      ['', ''], ['', ''], ['', ''], ['', ''], ['', ''],
      ['', ''], ['', ''], ['', ''], ['', ''], ['', ''],
      ['', ''], ['', ''], ['', ''], ['', ''], ['', ''],
   ]
};

var ui = {
   editor: $('#editor'),
   toolbar: {
      self: $('#toolbar'),
      btn_fold: $('#btn-toolbar-fold'),
      btn_load: $('#btn-load'),
      btn_save: $('#btn-save'),
      btn_add_node: $('#btn-add-node'),
      btn_add_edge: $('#btn-add-edge'),
      btn_update: $('#btn-update'),
      pnl_content: $('#pnl-toolbar-content'),
      pnl_selected: $('#pnl-selected'),
      tbl_property: $('#tbl-property')
   }
};

var ctrl = {
   state: {
      editor: {
         editing: false,
         selected: null
      },
      toolbar: {
         expanded: true,
         adding: {
            node: false,
            edge: false
         }
      }
   },
   editor: new vis.Network(ui.editor, {
      nodes: data.nodes,
      edges: data.edges
   }, {
      nodes: { shape: "dot" }
      // manipulation: { enabled: true }
   }),
   table: new Handsontable(ui.toolbar.tbl_property, {
      data: data.table,
      rowHeaders: false,
      colHeaders: ["key", "value"],
      minSpareRows: 0,
      width: '100%',
      height: 'auto',
      licenseKey: 'non-commercial-and-evaluation'
   })
};

function events() {
   on(ui.toolbar.btn_fold, 'click', function toogleToolbar(evt) {
      if (ctrl.state.toolbar.expanded) {
         evt.target.innerHTML = '&lt';
         ui.toolbar.pnl_content.classList.add('hide');
         ui.toolbar.self.style.width = '12px';
         ctrl.state.toolbar.expanded = false;
      } else {
         evt.target.innerHTML = '&gt';
         ui.toolbar.self.style.width = '200px';
         ui.toolbar.pnl_content.classList.remove('hide');
         ctrl.state.toolbar.expanded = true;
      }
   });
   on(ui.toolbar.btn_add_node, 'click', function toogleAddNode(evt) {
      ctrl.editor.disableEditMode();
      if (ctrl.state.toolbar.adding.node) {
         evt.target.innerHTML = 'Add Node';
         ctrl.state.toolbar.adding.node = false;
      } else {
         evt.target.innerHTML = 'Cancel (Add Node)';
         ui.toolbar.btn_add_edge.innerHTML = 'Add Edge';
         ctrl.state.toolbar.adding.node = true;
         ctrl.editor.addNodeMode();
      }
   });
   on(ui.toolbar.btn_add_edge, 'click', function toogleAddEdge(evt) {
      ctrl.editor.disableEditMode();
      if (ctrl.state.toolbar.adding.edge) {
         evt.target.innerHTML = 'Add Edge';
         ctrl.state.toolbar.adding.edge = false;
      } else {
         evt.target.innerHTML = 'Cancel (Add Edge)';
         ui.toolbar.btn_add_node.innerHTML = 'Add Node';
         ctrl.state.toolbar.adding.edge = true;
         ctrl.editor.addEdgeMode();
      }
   });
   ctrl.editor.on("click", function (params) {
      if (!ctrl.state.toolbar.adding.node) return;
      ui.toolbar.btn_add_node.innerHTML = 'Add Node';
      ctrl.state.toolbar.adding.node = false;
   });
   ctrl.editor.on("controlNodeDragEnd", function (params) {
      if (!ctrl.state.toolbar.adding.edge) return;
      var aux = params.controlEdge;
      if (!aux) return;
      if (!aux.from || !aux.to) return;
      ui.toolbar.btn_add_edge.innerHTML = 'Add Edge';
      ctrl.state.toolbar.adding.edge = false;
   });
   on(window, 'keypress', function deleteNode(evt) {
      switch (evt.key) {
      case 'Delete':
         editorDeleteSelectedNode();
         editorDeleteSelectedEdge();
         break;
      }
   });

   on(ui.toolbar.btn_load, 'click', function (evt) { editorLoad(); });
   on(ui.toolbar.btn_save, 'click', function (evt) { editorSave(); });

   ctrl.editor.on("selectNode", function (params) {
      tableLoad();
   });
   ctrl.editor.on("selectEdge", function (params) {
      tableLoad();
   });
   ctrl.editor.on("deselectNode", function (params) {
      tableLoad();
   });
   ctrl.editor.on("deselectEdge", function (params) {
      tableLoad();
   });
   on(ui.toolbar.btn_update, 'click', function (evt) {
      var selected = ctrl.state.editor.selected;
      if (!selected) return;
      var updated = {};
      selected.snapshot.forEach(function (key) {
         updated[key] = null;
      });
      for (var i = 0; i < data.table.length; i++) {
         var key = ctrl.table.getDataAtCell(i, 0);
         var val = ctrl.table.getDataAtCell(i, 1);
         if (constant.regex.integer.test(val)) {
            val = parseInt(val, 10);
         } else if (constant.regex.float.test(val)) {
            val = parseFloat(val);
         }
         updated[key] = val;
      }
      updated.id = selected.id;
      data[selected.type].update(updated);
   });
}

function tableLoad() {
   var selected = editorGetSelected();
   reset();
   if (selected) {
      var one = Object.assign({}, data[selected.type].get(selected.id));
      delete one.id;
      delete one.x;
      delete one.y;
      delete one.to;
      delete one.from;
      selected.snapshot = Object.keys(one);
      selected.snapshot.forEach(function (key, i) {
         if (i >= 20) return; // not support yet
         ctrl.table.setDataAtCell(i, 0, key);
         ctrl.table.setDataAtCell(i, 1, one[key]);
      });
   }

   function reset() {
      for (var i = 0; i < data.table.length; i++) {
         ctrl.table.setDataAtCell(i, 0, '');
         ctrl.table.setDataAtCell(i, 1, '');
      }
   }
}
function editorGetSelected() {
   var id, meta;
   id = ctrl.editor.getSelectedNodes()[0];
   if (id) {
      meta = { type: 'nodes', id: id };
      ctrl.state.editor.selected = meta
      return meta;
   }
   id = ctrl.editor.getSelectedEdges()[0];
   if (id) {
      meta = { type: 'edges', id: id };
      ctrl.state.editor.selected = meta;
      return meta;
   }
   ctrl.state.editor.selected = null;
   return null;
}
function editorDeleteSelectedNode() {
   var id = ctrl.editor.getSelectedNodes()[0];
   if (!id) return;
   data.nodes.remove(id);
}
function editorDeleteSelectedEdge() {
   var id = ctrl.editor.getSelectedEdges()[0];
   if (!id) return;
   data.edges.remove(id);
}
function editorLoad() {
   ajax({
      url: '/api/v0/load',
      method: 'GET'
   }).then(function (text) {
      data.edges.clear();
      data.nodes.clear();
      var json = JSON.parse(text);
      json.nodes.forEach(function (node) {
         data.nodes.add(node);
      });
      json.edges.forEach(function (edge) {
         data.edges.add(edge);
      });
      alert('loaded!');
   });
}
function editorSave() {
   var obj = {
      nodes: [],
      edges: []
   };
   data.nodes.getIds().forEach(function (nid) {
      var node = Object.assign({}, data.nodes.get(nid));
      obj.nodes.push(node);
   });
   data.edges.getIds().forEach(function (nid) {
      var edge = Object.assign({}, data.edges.get(nid));
      obj.edges.push(edge);
   });
   ajax({
      url: '/api/v0/save',
      method: 'POST',
      json: obj
   }).then(function () {
      alert('saved!');
   });
}

function expose() {
   window.zvis = {
      data: data,
      ui: ui,
      ctrl: ctrl
   };
}

function bootstrap() {
   events();
   expose();
}

bootstrap();

})();

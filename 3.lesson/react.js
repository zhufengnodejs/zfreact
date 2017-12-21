//定义ReactClass类,所有自定义的超级父类
let ReactClass = function () {

}
//留给子类去继承覆盖
ReactClass.prototype.render = function () {

}
ReactClass.prototype.setState = function (newState) {
  //还记得我们在ReactCompositeComponent里面mount的时候 做了赋值
  //所以这里可以拿到 对应的ReactCompositeComponent的实例_reactInternalInstance
  this._reactIntervalInstance.receiveComponent(null, newState);
  //setState主要调用了对应的component的receiveComponent来实现更新。所有的挂载，更新都应该交给对应的component来管理。
  //就像所有的component都实现了mountComponent来处理第一次渲染，所有的componet类都应该实现receiveComponent用来处理自己的更新
}

//component类,用来表示文本在渲染 更新 删除时应该做些什么事情
function ReactDOMTextComponent(text) {
  //保存当前的字符串的值
  this._currentElement = '' + text;
  //用来标识当前的component
  this._rootNodeID = null;
}
//ReactDOMTextComponent是一个component类定义，定义对于这种文本类型的节点，在渲染，更新，删除时应该做什么操作，这边暂时只用到渲染
ReactDOMTextComponent.prototype.mountComponent = function (rootID) {
  this._rootNodeID = rootID;
  return `<span data-reactid="${rootID}">${this._currentElement}</span>`;
}
////component类，用来表示文本在渲染，更新，删除时应该做些什么事情
function ReactDOMComponent(element) {
  this._currentElement = element;
  this._rootNodeID = null;
}
ReactDOMComponent.prototype.mountComponent = function (rootID) {
  this._rootNodeID = rootID;
  let props = this._currentElement.props;
  let tagOpen = `<${this._currentElement.type}`;
  let tagClose = `</${this._currentElement.type}>`;
  tagOpen += ` data-reactid=${this._rootNodeID}`;
  for (let propKey in props) {
    //这里要做一下事件的监听，就是从属性props里面解析拿出on开头的事件属性的对应事件监听
    if (/^on[A-Za-z]/.test(props)) {
      let eventType = propKey.replace('on', '');
      //针对当前的节点添加事件代理,以_rootNodeID为命名空间
      $(document).delegate(`[data-reactid=${this._rootNodeID}]`, `${eventType}.${this._rootNodeID}`, props[propKey]);
    }
    //对于children属性以及事件监听的属性不需要进行字符串拼接
    //事件会代理到全局。这边不能拼到dom上不然会产生原生的事件监听
    if (props[propKey] && propKey != 'children' && /^on[A-Za-z]/.test(propKey)) {
      tagOpen += ' ' + propKey + '=' + props[propKey];
    }
  }
  //获取子节点渲染出的内容
  let content = '';
  let children = props.children || [];
  let childrenInstances = [];
  let that = this;
  $.each(children, function (key, child) {
    let childComponentInstance = instantiateReactComponent(child);
    childComponentInstance._mountIndex = key;
    childrenInstances.push(childComponentInstance);
    //子节点的rootId是父节点的rootId加上新的key也就是顺序的值拼成的新值
    let curRootId = that._rootNodeID + '.' + key;
    //得到子节点的渲染内容
    let childMarkup = childComponentInstance.mountComponent(curRootId);
    //拼接在一起
    content += ' ' + childMarkup;
  });
  //留给以后更新时用的这边先不用管
  this._renderdChildren = childrenInstances;
  //拼出整个html内容
  return tagOpen + '>' + content + tagClose;
}
function ReactCompositeComponent(element) {
  //存放element对象
  this._currentElement = element;
  //存放唯一标识
  this._rootNodeID = null;
  //存放对应的ReactClass实例
  this._instance = null;
}
ReactCompositeComponent.prototype.mountComponent = function (rootID) {
  this._rootNodeID = rootID;
  //拿到当前元素对应的属性值
  let publicProps = this._currentElement.props;
  //拿到对应的ReactClass
  let ReactClass = this._currentElement.type;
  // Initialize the public class
  let inst = new ReactClass(publicProps);
  this._instance = inst;
  //保留对当前component的引用,以后更新会用
  inst._reactIntervalInstance = this;
  if (inst.componentWillMount) {
    // //这里在原始的reactjs其实还有一层处理，就是  componentWillMount调用setstate，不会触发rerender而是自动提前合并，这里为了保持简单，就略去了
    inst.componentWillMount();
  }
  //调用ReactClass的实例的render方法,返回一个element或者一个文本节点
  let renderedElement = this._instance.render();
  //得到renderedElement对应的component实例
  let renderedComponentInstance = instantiateReactComponent(renderedElement);
  this._renderedComponent = renderedComponentInstance;
  //拿到渲染之后的字符串内容，将当前的_rootNodeID传给render出的节点
  let renderedMarkup = renderedComponentInstance.mountComponent(this._rootNodeID);
  //之前我们在React.render方法最后触发了mountReady事件，所以这里可以监听，在渲染完成后会触发。
  $(document).on('mountReady', function () {
    //调用inst.componentDidMount
    inst.componentDidMount && inst.componentDidMount();
  });
  return renderedMarkup;
}
ReactCompositeComponent.prototype.receiveComponent = function (nextElement, newState) {
  //如果接收了新的,就使用新的element
  this._currentElement = nextElement || this._currentElement;
  let inst = this._instance;
  //合并state
  let nextState = $.extend(inst.state, newState);
  let nextProps = this._currentElement.props;
  inst.state = nextState;

  ////如果inst有shouldComponentUpdate并且返回false。说明组件本身判断不要更新，就直接返回。
  if (inst.shouldComponentUpdate && (inst.shouldComponentUpdate(nextProps, nextState)) == false) return;
  //生命周期管理，如果有componentWillUpdate，就调用，表示开始要更新了。
  if (inst.componentWillUpdate) inst.componentWillUpdate(nextProps, nextState);

  let prevComponentInstance = this._renderedComponent;
  let prevRenderedElement = prevComponentInstance._currentElement;
  //重新执行render拿到新的element
  let nextRenderedElement = this._instance.render();
  //判断是需要更新还是直接就重新渲染
  //注意这里的_shouldUpdateReactComponent跟上面的不同哦 这个是全局的方法
  if (_shouldUpdateReactComponent(prevRenderedElement, nextRenderedElement)) {
    //如果需要更新，就继续调用子节点的receiveComponent的方法，传入新的element更新子节点。
    prevComponentInstance.receiveComponent(nextRenderedElement);
    //调用componentDidUpdate表示更新完成了
    inst.componentDidUpdate && inst.componentDidUpdate();
  } else {
    //如果发现完全是不同的两种element，那就干脆重新渲染了
    let thisID = this._rootNodeID;
    //重新new一个对应的component，
    this._renderedComponent = this._instantiateReactComponent(nextRenderedElement);
    //重新生成对应的元素内容
    let nextMarkup = _renderedComponent.mountComponent(thisID);
    //替换整个节点
    $(`[data-reactid="${this._rootNodeID}"]`).replaceWith(nextMarkup);
  }
}

//用来判定两个element需不需要更新
//这里的key是我们createElement的时候可以选择性的传入的。用来标识这个element，当发现key不同时，我们就可以直接重新渲染，不需要去更新了。
function _shouldUpdateReactComponent(prevElement, nextElement) {
  if (prevElement != null && nextElement != null) {
    let prevType = typeof prevElement;
    let nextType = typeof nextElement;
    if (prevType === 'string' || prevType == 'number') {
      return nextType == 'string' || nextType === "number";
    } else {
      return nextType === 'object' && prevElement.type == nextElement.type && prevElement.key === nextElement.key;
    }
  }
  return false;
}
//用来根据element的类型（现在只有一种string类型），返回一个component的实例。其实就是个类工厂。
//我们增加了一个判断，这样当render的不是文本而是浏览器的基本元素时。我们使用另外一种component来处理它渲染时应该返回的内容。这里就体现了工厂方法instantiateReactComponent的好处了，不管来了什么类型的node，都可以负责生产出一个负责渲染的component实例。这样render完全不需要做任何修改，只需要再做一种对应的component类型（这里是ReactDOMComponent）就行了
function instantiateReactComponent(node) {
  if (typeof node === 'string' || typeof node === 'number') {
    return new ReactDOMTextComponent(node);
  }
  if (typeof node == 'object' && typeof node.type == 'string') {
    return new ReactDOMComponent(node);
  }
  //自定义的元素节点
  if (typeof node == 'object' && typeof node.type === 'function') {
    //注意这里，使用新的component,专门针对自定义元素
    return new ReactCompositeComponent(node);
  }
}

function ReactElement(type, key, props) {
  this.type = type;
  this.key = key;
  this.props = props;
}


React = {
  //nextReactRootIndex作为每个component的标识id，不断加1，确保唯一性。这样我们以后可以通过这个标识找到这个元素。
  nextReactRootIndex: 0,
  createElement(type, config, children){
    let props = {}, propName;
    config = config || {};
    //看看有没有key,用来标识element的类型,方便以后高效的更新
    let key = config.key || null;
    for (propName in config) {
      if (config.hasOwnProperty(propName) && propName != "key") {
        props[propName] = config[propName];
      }
    }
    //处理children,全部挂载到props的children属性上
    //支持两种写法,如果只有一个参数,直接赋值给children,否则做合并处理
    let childrenLength = arguments.length - 2;
    if (childrenLength === 1) {
      props.children = $.isArray(children) ? children : [children];
    } else if (childrenLength > 1) {
      let childArray = Array(childrenLength);
      for (let i = 0; i < childrenLength; i++) {
        childArray[i] = arguments[i + 2];
      }
      props.children = childArray;
    }
    return new ReactElement(type, key, props);
  },
  createClass(spec){
    //生成一个子类
    let Constructor = function (props) {
      this.props = props;
      this.state = this.getInitialState ? this.getInitialState() : null;
    }
    Constructor.prototype = new ReactClass();
    Constructor.prototype.constructor = Constructor;
    //混入spec到原型
    $.extend(Constructor.prototype, spec);
    return Constructor;
  },
  //React.render 作为入口负责调用渲染
  render(element, container){
    let componentInstance = instantiateReactComponent(element);
    let markup = componentInstance.mountComponent(React.nextReactRootIndex++);
    $(container).html(markup);
    $(document).trigger('mountReady');
  }
}
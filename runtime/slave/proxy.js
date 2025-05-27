if (!self.slave) self.slave = {}
const idMap = new Map([[0, self]])
let nextid = -1

slave.wrap = (arg) => {
    if (canClone(arg)) {
        return [0, arg]
    } else {
        return [1, obj2id(arg)]
    }
}

slave.unwrap = (arr) => {
    switch (arr[0]) {
        case 0: // primitive
            return arr[1]
        case 1: // object
            return id2obj(arr[1])
        case 2: // callback
            return getCb(arr[1])
        case 3: // property
            return id2prop(arr[1], arr[2])
        default:
            throw new Error('invalid arg type')
    }
}

slave.connect = function connect(worker) {
    worker.onmessage = (e) => slave.onmessage(e.data)
    slave.postMessage = (data) => worker.postMessage(data)
    worker.postMessage('start')
}

function id2obj(id) {
    const ret = idMap.get(id)
    if (!ret) throw new Error('missing object id: ' + id)
    return ret
}

function obj2id(object) {
    const id = nextid--
    idMap.set(id, object)
    return id
}

function id2prop(id, path) {
    const ret = idMap.get(id)
    if (!ret) throw new Error('missing object id: ' + id)
    let base = ret
    for (let i = 0, len = path.length; i < len; ++i) base = base[path[i]]
    return base
}

function getCb(id) {
    return (...args) =>
        slave.postMessage({
            type: 'cb',
            id,
            args: args.map(slave.wrap),
        })
}

slave.onmessage = function (data) {
    switch (data.type) {
        case 'cmds':
            command(data)
            break
        case 'cleanup':
            cleanup(data)
            break
        default:
            console.error('Unknown message type: ' + data.type)
            break
    }
}

function command(data) {
    const res = []
    for (const cmd of data.cmds) process(cmd, res)

    slave.postMessage({
        type: 'done',
        flushId: data.flushId,
        res,
    })
}

function process(arr) {
    const type = arr[0]
    switch (type) {
        case 0:
            call(arr[1], arr[2], arr[3], arr[4], type)
            break
        case 1:
            set(arr[1], arr[2], arr[3])
            break
        case 2:
            call(arr[1], arr[2], arr[3], arr[4], type)
            break
        default:
            throw new Error('invalid cmd type: ' + type)
    }
}

function call(id, path, arg, returnid, isNew) {
    const obj = id2obj(id)
    const args = arg.map(slave.unwrap)
    const name = path[path.length - 1]
    let base = obj
    for (let i = 0; i < path.length - 1; i++) {
        base = base[path[i]]
    }
    let ret = isNew ? new base[name](...args) : base[name](...args)
    idMap.set(returnid, ret)
}

function set(id, path, arg) {
    const obj = id2obj(id)
    const value = slave.unwrap(arg)
    const name = path[path.length - 1]
    let base = obj
    for (let i = 0; i < path.length - 1; i++) {
        base = base[path[i]]
    }
    base[name] = value
}

function cleanup(data) {
    for (const id of data.ids) idMap.delete(id)
}

function canClone(o) {
    const t = typeof o
    return (
        t === 'undefined' ||
        o === null ||
        t === 'boolean' ||
        t === 'number' ||
        t === 'string' ||
        o instanceof Blob ||
        o instanceof ArrayBuffer ||
        o instanceof ImageData
    )
}
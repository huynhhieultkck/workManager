const Joi = require("joi");
const { XlevelDb, Xcode, Xtime } = require("xsupport")

const db = new XlevelDb('pool');

const _validate = (j, v) => {
    const { error, value } = j.validate(v);
    if (error) throw error;
    return value;
}
const _randomKey = () => `${Xcode.uuid.v4().split('-')[0]}${Date.now()}`

// A:chưa giải quyết
// B:đang giải quyết
// C:đã giải quyết

const add = async (req, res) => {
    const schema = Joi.array().items({
        type: Joi.string().required(),
        data: Joi.object().required()
    }).min(1);
    let data = _validate(schema, [req.body].flat());
    data = data.map(value => ({ key: _randomKey(), value }));
    await db.putMany('A', data);
    return res.json({ success: true, keys: data.map(v => v.key) });
}
const get = async (req, res) => {
    const { count } = req.query;
    const works = await db.shiftMany('A', count || 1, { action: 'move', newType: 'B' });
    return res.json({ success: true, works });
}
const submit = async (req, res) => {
    const schema = Joi.array().items({
        key: Joi.string().required(),
        value: Joi.object().required()
    }).min(1);
    const data = _validate(schema, [req.body].flat());
    await db.delMany('B', data.map(v => v.key));
    await db.putMany('C', data);
    return res.json({ success: true });
}
const view = async (req, res) => res.json({ success: true, result: await db.get('C', req.params.key) });
const views = async (req, res) => {
    const schema = Joi.array().items(Joi.string()).min(1);
    const data = _validate(schema, req.body);
    return res.json({ success: true, results: await db.getMany('C', data) });
}
const worker = {};
const count = async (req, res) => {
    console.log(123);
    
    const [pending, in_progress, completed] = await Promise.all([
        db.count('A'),
        db.count('B'),
        db.count('C')
    ]);
    res.json({
        success: true,
        workers: {
            length: Object.keys(worker).length,
            ntask: Object.values(worker).reduce((o, v) => o + v.ntask, 0)
        },
        work: { pending, in_progress, completed },
        speed: completed * 6
    });
}
const sign = async (req, res) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    let ntask = _validate(Joi.number(), req.query.ntask || 0);
    worker[clientIp] = { createAt: Date.now(), ntask };
    return res.json({ success: true });
}

(async () => {
    while (true) {
        await db.cleanup('B', 600, { newType: 'A' });
        await db.cleanup('C', 600);
        for (const key in worker) {
            if ((worker[key].createAt - Date.now()) > 600000) delete worker[key];
        }
        await Xtime.sleep(60000);
    }
})();

module.exports = {
    db,
    add,
    get,
    submit,
    view,
    views,
    count,
    sign
}
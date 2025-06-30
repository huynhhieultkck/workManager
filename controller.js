const Joi = require("joi");
const { XlevelDb, Xcode } = require("xsupport")

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
    const { count = 1 } = req.query;
    const works = await db.shiftMany('A', count, { action: 'move', newType: 'B' });
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
const count = async (req, res) => res.json({ success: true, pending: await db.count('A'), in_progress: await db.count('B'), completed: await db.count('C') });

module.exports = {
    db,
    add,
    get,
    submit,
    view,
    views,
    count
}
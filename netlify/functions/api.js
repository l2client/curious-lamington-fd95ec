exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const data = JSON.parse(event.body);
        const telegram_id = data.telegram_id;
        const username = data.username || 'Герой';
        const action = data.action || '';
        const class_type = data.class_type || 'warrior';

        if (!telegram_id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'No telegram_id provided' }) };
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_KEY;

        const headers = {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
        };

        let response = await fetch(`${supabaseUrl}/rest/v1/l2_users?telegram_id=eq.${telegram_id}&select=*`, {
            method: 'GET',
            headers: headers
        });
        let users = await response.json();
        let user = users && users.length > 0 ? users[0] : null;

        // Создание персонажа или принудительный выбор класса
        if (!user || action === 'create') {
            if (action === 'create' || !user) {
                let stats = getStatsForClass(class_type);
                const newUser = {
                    telegram_id,
                    username,
                    class_type,
                    level: 1,
                    exp: 0,
                    adena: 0,
                    ...stats
                };

                if (user) {
                    await fetch(`${supabaseUrl}/rest/v1/l2_users?telegram_id=eq.${telegram_id}`, {
                        method: 'DELETE',
                        headers: headers
                    });
                }

                let insertRes = await fetch(`${supabaseUrl}/rest/v1/l2_users`, {
                    method: 'POST',
                    headers: { ...headers, 'Prefer': 'return=representation' },
                    body: JSON.stringify(newUser)
                });
                let inserted = await insertRes.json();
                user = inserted[0];
            } else {
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ success: true, needs_creation: true })
                };
            }
        }

        if (!user) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, needs_creation: true })
            };
        }

        // Логика PvE атаки
        if (action === 'attack') {
            let gainedExp = 30;
            let gainedAdena = 15;
            let newExp = user.exp + gainedExp;
            let newAdena = user.adena + gainedAdena;
            let newLevel = user.level;
            let newMaxHp = user.max_hp;
            let newMaxMp = user.max_mp;
            let newPAtk = user.p_atk;
            let newPDef = user.p_def;
            let newMAtk = user.m_atk;
            let newMDef = user.m_def;

            const expNeeded = user.level * 100;
            if (newExp >= expNeeded) {
                newLevel += 1;
                newExp -= expNeeded;
                newMaxHp += 25;
                newMaxMp += 15;
                if (newPAtk > 0) { newPAtk += 6; newPDef += 5; }
                if (newMAtk > 0) { newMAtk += 8; newMDef += 6; }
            }

            await fetch(`${supabaseUrl}/rest/v1/l2_users?telegram_id=eq.${telegram_id}`, {
                method: 'PATCH',
                headers: headers,
                body: JSON.stringify({
                    level: newLevel,
                    exp: newExp,
                    adena: newAdena,
                    hp: newMaxHp,
                    max_hp: newMaxHp,
                    max_mp: newMaxMp,
                    p_atk: newPAtk,
                    p_def: newPDef,
                    m_atk: newMAtk,
                    m_def: newMDef
                })
            });

            let freshRes = await fetch(`${supabaseUrl}/rest/v1/l2_users?telegram_id=eq.${telegram_id}&select=*`, {
                method: 'GET',
                headers: headers
            });
            let freshUsers = await freshRes.json();
            if (freshUsers && freshUsers.length > 0) {
                user = freshUsers[0];
            }
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, user })
        };

    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};

function getStatsForClass(type) {
    switch (type) {
        case 'mage':
            return { hp: 80, max_hp: 80, mp: 150, max_mp: 150, p_atk: 0, p_def: 12, m_atk: 30, m_def: 25, p_atk_speed: 300, m_cast_speed: 400, crit: 3 };
        case 'overlord':
            return { hp: 110, max_hp: 110, mp: 130, max_mp: 130, p_atk: 0, p_def: 20, m_atk: 25, m_def: 22, p_atk_speed: 300, m_cast_speed: 350, crit: 4 };
        case 'archer':
            return { hp: 90, max_hp: 90, mp: 60, max_mp: 60, p_atk: 25, p_def: 16, m_atk: 0, m_def: 15, p_atk_speed: 400, m_cast_speed: 300, crit: 10 };
        case 'warrior':
        default:
            return { hp: 130, max_hp: 130, mp: 50, max_mp: 50, p_atk: 20, p_def: 25, m_atk: 0, m_def: 15, p_atk_speed: 300, m_cast_speed: 300, crit: 5 };
    }
}
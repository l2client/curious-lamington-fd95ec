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

        // 1. Поиск игрока в базе
        let response = await fetch(`${supabaseUrl}/rest/v1/l2_users?telegram_id=eq.${telegram_id}&select=*`, {
            method: 'GET',
            headers: headers
        });
        let users = await response.json();
        let user = users && users.length > 0 ? users[0] : null;

        // Если игрока нет — сигнализируем клиенту, что нужно открыть экран создания персонажа
        if (!user) {
            if (action === 'create') {
                // Создаем персонажа по выбранному классу
                let stats = getBaseStatsForClass(class_type);
                const newUser = {
                    telegram_id,
                    username,
                    class_type,
                    level: 1,
                    exp: 0,
                    adena: 0,
                    ...stats
                };

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

        // 2. Логика PvE атаки моба
        if (action === 'attack' && user) {
            let gainedExp = 25;
            let gainedAdena = 12;
            let newExp = user.exp + gainedExp;
            let newAdena = user.adena + gainedAdena;
            let newLevel = user.level;
            let newMaxHp = user.max_hp;
            let newMaxMp = user.max_mp;
            let newPAtk = user.p_atk;
            let newPDef = user.p_def;

            const expNeeded = user.level * 100;
            if (newExp >= expNeeded) {
                newLevel += 1;
                newExp -= expNeeded;
                newMaxHp += 25;
                newMaxMp += 15;
                newPAtk += 6;
                newPDef += 5;
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
                    p_def: newPDef
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

function getBaseStatsForClass(type) {
    switch (type) {
        case 'mage':
            return { hp: 80, max_hp: 80, mp: 120, max_mp: 120, p_atk: 10, m_atk: 25, p_def: 15, m_def: 25, p_atk_speed: 250, m_cast_speed: 400, crit: 3 };
        case 'archer':
            return { hp: 90, max_hp: 90, mp: 60, max_mp: 60, p_atk: 22, m_atk: 8, p_def: 16, m_def: 16, p_atk_speed: 350, m_cast_speed: 300, crit: 8 };
        case 'assassin':
            return { hp: 95, max_hp: 95, mp: 50, max_mp: 50, p_atk: 20, m_atk: 8, p_def: 18, m_def: 15, p_atk_speed: 380, m_cast_speed: 300, crit: 12 };
        case 'warrior':
        default:
            return { hp: 120, max_hp: 120, mp: 50, max_mp: 50, p_atk: 18, m_atk: 8, p_def: 24, m_def: 18, p_atk_speed: 300, m_cast_speed: 300, crit: 4 };
    }
}
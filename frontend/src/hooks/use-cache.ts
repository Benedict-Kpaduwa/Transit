import jwt from 'jsonwebtoken';
import fs from 'fs';

const PUBLIC_KEY = fs.readFileSync('./keys/public.pem');

interface DecodedToken {
    userId: string;
    role: string;
}

function verifyToken(token: string): DecodedToken {
    const decoded = jwt.verify(token, PUBLIC_KEY, {
        algorithms: ['RS256', 'HS256']
    });
    return decoded as DecodedToken;
}

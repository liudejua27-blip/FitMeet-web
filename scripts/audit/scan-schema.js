const fs = require('fs');
const path = require('path');

function getFiles(dir, exclude) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            if (!exclude.includes(file)) results = results.concat(getFiles(filePath, exclude));
        } else {
            results.push(filePath);
        }
    });
    return results;
}

const entityFiles = getFiles('backend/src', ['dist', 'artifacts']).filter(f => f.endsWith('.entity.ts'));
const entities = {};

entityFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const entityMatch = content.match(/@Entity\s*\(\s*['"](.+?)['"]/);
    if (entityMatch) {
        const tableName = entityMatch[1];
        entities[tableName] = { columns: [], file };
        const colRegex = /@(Column|PrimaryGeneratedColumn|PrimaryColumn)\s*\([^)]*\)\s*(?:readonly\s+|public\s+|private\s+)?(\w+)/g;
        let m;
        while ((m = colRegex.exec(content)) !== null) {
            entities[tableName].columns.push(m[2]);
        }
        // Fallback for simple @Column() property
        const colPropRegex = /@(Column|PrimaryGeneratedColumn|PrimaryColumn)\s*\(\s*\)\s*(?:readonly\s+|public\s+|private\s+)?(\w+)/g;
        while ((m = colPropRegex.exec(content)) !== null) {
           if(!entities[tableName].columns.includes(m[2])) entities[tableName].columns.push(m[2]);
        }
    }
});

const migrationFiles = getFiles('backend/src/database/migrations', []).filter(f => f.endsWith('.ts'));
const migrationContent = migrationFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');

const patchFiles = [
    'backend/scripts/production-schema-patch-20260511.sql',
    'backend/scripts/agent-social-runtime-schema-patch-20260511.sql',
    'backend/scripts/agent-schema-drift-fix-20260513.sql'
];
const patchContent = patchFiles.filter(f => fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n');

const results = {
    entities: entities,
    migrationCoverage: {},
    patchCoverage: {}
};

Object.keys(entities).forEach(table => {
    results.migrationCoverage[table] = {
        tableExists: migrationContent.includes(table),
        missingColumns: entities[table].columns.filter(col => !migrationContent.includes(col))
    };
    results.patchCoverage[table] = {
        tableExists: patchContent.includes(table),
        missingColumns: entities[table].columns.filter(col => !patchContent.includes(col))
    };
});

console.log(JSON.stringify(results, null, 2));

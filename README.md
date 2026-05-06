# Mini CRM Immobilier

Un système de gestion de la relation client simple pour l'immobilier.

## Fonctionnalités

- **Tableau de bord** : Vue d'ensemble avec statistiques
- **Gestion des clients** : Ajouter, modifier les clients (acheteurs, vendeurs, locataires)
- **Gestion des propriétés** : Ajouter, modifier les propriétés
- **Journal d'activités** : Enregistrer les interactions (appels, rendez-vous, emails)
- **Tâches** : Gestion des tâches à faire

## Installation

1. Créez un projet Supabase : https://supabase.com
2. Copiez l'URL et la clé anon de votre projet
3. Remplacez `YOUR_SUPABASE_URL` et `YOUR_SUPABASE_ANON_KEY` dans `assets/js/app.js`

## Configuration de la base de données

Créez les tables suivantes dans Supabase :

### clients
```sql
CREATE TABLE clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  type TEXT CHECK (type IN ('buyer', 'seller', 'renter')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### properties
```sql
CREATE TABLE properties (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  address TEXT NOT NULL,
  type TEXT CHECK (type IN ('house', 'apartment')),
  price INTEGER,
  status TEXT CHECK (status IN ('available', 'sold', 'rented')) DEFAULT 'available',
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### activities
```sql
CREATE TABLE activities (
  id SERIAL PRIMARY KEY,
  type TEXT CHECK (type IN ('call', 'meeting', 'email')) NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  property_id INTEGER REFERENCES properties(id),
  notes TEXT NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### tasks
```sql
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status TEXT CHECK (status IN ('pending', 'completed')) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Utilisation

Ouvrez `index.html` dans votre navigateur. Le CRM se charge automatiquement avec le tableau de bord.

Utilisez les boutons de navigation pour accéder aux différentes sections.

## Responsive

Le design est adapté pour mobile et PC.
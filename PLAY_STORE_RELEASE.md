# Publication de ViralVoice sur Google Play

## État actuel

- APK Android Java compilé par Gradle.
- Version applicative : 3.5.0, versionCode 8.
- Politique de confidentialité : `privacy-policy.html`.
- Workflow AAB signé : `.github/workflows/android-play-release.yml`.
- Application ID : `com.chasmet.viralvoice`.

## Blocages avant envoi dans la Play Console

1. Créer et vérifier le compte Google Play Console.
2. Migrer la version Play vers le niveau d’API cible exigé par Google Play.
3. Créer une clé d’envoi et conserver sa sauvegarde.
4. Ajouter la clé sous forme de secrets GitHub :
   - `PLAY_UPLOAD_KEYSTORE_BASE64`
   - `PLAY_STORE_PASSWORD`
   - `PLAY_KEY_ALIAS`
   - `PLAY_KEY_PASSWORD`
5. Remplacer les liens Revolut dans la version Play par Google Play Billing.
6. Vérifier les achats sur le backend avant d’ajouter des minutes.
7. Remplir la fiche Play Store, la section Sécurité des données et la classification du contenu.
8. Exécuter les tests internes puis le test fermé demandé par Google pour les nouveaux comptes personnels.

## Produits consommables proposés

| Identifiant Play | Contenu |
|---|---:|
| `viralvoice_minutes_5` | 5 minutes |
| `viralvoice_minutes_30` | 30 minutes |
| `viralvoice_minutes_60` | 60 minutes |
| `viralvoice_minutes_180` | 180 minutes |

Les prix sont configurés dans la Play Console et non codés en dur dans l’APK Play.

## Traitement sécurisé d’un achat

1. L’application lance Google Play Billing.
2. Elle reçoit le `purchaseToken`.
3. Elle envoie ce jeton au backend ViralVoice avec l’e-mail du client.
4. Le backend vérifie l’achat auprès de l’API Google Play Developer.
5. Le backend refuse tout jeton déjà utilisé.
6. Il crédite les minutes dans Supabase.
7. Il consomme le produit afin qu’il puisse être racheté.

## Fiche proposée

**Nom :** ViralVoice — Traduction vidéo IA

**Résumé :** Traduisez et doublez vos vidéos avec des voix IA adaptées à chaque intervenant.

**Catégorie :** Outils / Montage vidéo

**Contact :** skypieachannel@gmail.com

## Tests minimums

- import vidéo et audio ;
- traduction dans chaque langue proposée ;
- conversation femme/homme, femme/femme et homme/homme ;
- téléchargement du résultat ;
- compte sans crédit et compte crédité ;
- restauration et vérification des achats ;
- fonctionnement après fermeture puis réouverture ;
- test sur Android 5, Android 10, Android 14, Android 15 et Android 16.

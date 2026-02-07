# **Every.music**

\---

# **Mission**

**Every.music** is an application that helps you

* Find members for both new and existing music groups through a feed of announcements. \-\> ***Join-a-band? Craigslist? No more\!***  
* Build your personal branding in the music world, showcase your skills and your resume\! \-\> ***LinkedIn for musicians? Maybe.***  
* Joining a global community of musicians \-\> ***Instagram for musicians? Kinda***

# **MVP**

For an MVP the following functionalities are needed

* Login  
  * Google  
  * Email \+ password (confirmation required)  
* Logout  
* User profile  
  * Create  
  * Edit  
  * Search (w/ filter)  
  * Chat (external)  
* Ads (looking for X/Y)  
  * Create  
  * Edit  
  * Search (w/ filter)  
  * Reply (external)

To realize the MVP we have a few strategies

## Mockup & Design

And [Mockup\_rotated.pdf](https://drive.google.com/file/d/170vDUrv4Cr5Vz6sJZyzOEXbZQF_YLhio/view?usp=share_link)for a snapshot

We will also need

* A palette  
* A logo  
* An app icon  
* A splash screen (when the app starts)  
* Font

# **Architecture & tech stack**

## Architecture.

* microservices API backend \+ web based app and desktop  
* native app (iOS) \+ native app (Android)  
* database Postgres

## Tech stack

The ideal situation would be having a cross-platform development process with one codebase only, at least for the app.  
Tauri seems the reasonable choice matching Performance and Development Experience (DX) parameters; an alternative could be React Native or a framework like Ionic.

* **Tauri (for web and desktop app) [https://v2.tauri.app/](https://v2.tauri.app/)** 

As for backend, since it’s API any tech can be fine as long as the resulting API is fast, reliable and light

* [Fastify](https://www.fastify.io/) (NodeJs Framework) \- JavaScript [https://github.com/fastify/fastify](https://github.com/fastify/fastify) 

As for the frontend let’s just use React \+ Vite

## Cloud provider

Whatever the choice will be, where do we host it?

* **Cloudflare (generous free tier)**

## Database

What database should we use? Non-relational? NoSql? Sql?  
Which costs less? How do we dimension it? Can we make it auto scalable?  
This depends heavily on the Cloud provider we choose.

* **Google CloudSQL**  
* **Google Firestore**  
* **Amazon DynamoDB**

## Storage

What storage should we use? What kind of performance do we need?

* **Google Cloud Storage**  
* **Amazon S3**

## Mail

We need a mailing provider/system. Which one should we use?

* **SendGrid \+ Google**

## Login

Here we can make multiple choices and add them later on with OAuth 2.0 integration

* **Google**  
* **Mail \+ password (and confirmation)**  
* **Apple ID**  
* **Facebook**

## Push notification

We need a push notification system. Which one should we use?

* **Google Firebase**   
* **Amazon Simple Notification Service (APNS)**

These are big IFs and we need to solve each one before looking at features roadmap

# **Marketing**

## Competitors

* Vampr (app)  
* join-a-band (website)  
* villaggiomusicale (website)

Ideas:

* Writing a dev Blog meanwhile building the app  
* Use App Store Optimization (basically SEO for apps)  
* Make big artists endorse the app somehow  
* Rate the app and get free points to spend in the shop

# **Monetization model**

We have to consider different monetization tools

* ADS  
* Freemium functionalities (ex. ads pinned)  
* Subscription  
* Pay to download app  
* In-app purchases

There are countless combinations but I would definitely not have ADS, or, at least have ADS only bannered and music-related.

In a second phase, we may want to monetize via concerts sponsorships and fees for bands.

However, we don’t need much money to start since we don’t have many information that need to be stored in a database and could present sizing issues

* Profile   
  * pictures  
  * bio  
  * some small text fields  
* Ad   
  * pictures  
  * description  
  * some small text fields  
* Datasets  
  * Cities/Region/States json  
  * Music instruments json  
  * Genres json

The heaviest stuff we store are profile pictures which we can however limit in weight and resolution, ads picture (same), some text for both ads and profiles and of course every ad which we should limit to, for example, 5 ads per person.

Let’s analyze some more monetization issues.

## Warning: Platform Fees

We have to keep in mind that platforms take fees

## Ads

People, including us, dislike ads so much. How can we introduce them without being annoying? Maybe heavily music-related ads? Is that possible?

* Rewarded video ads   
  * Watch a video and get some in-app currency  
  * 10 video ads \= 1 boost?  
* Native ads  
  * When scrolling for ads or profiles, see some random ad

## Freemium functionalities

This could be the answer to introduce subscription advantages and/or in-app purchase points expendable to buy those same advantages.

* Extend the max announcement limit per person   
  * MAX\_ANNOUNCEMENT\_LIMIT \= 5  
* Extend the max announcement filter saved  
  * MAX\_FILTERS\_SAVED \= 1  
* See ads stats  
  * SEE\_ADS\_STATS \= false  
* Extend the max projects shown in profile limit  
  * MAX\_PROJECTS\_SHOWN \= 3  
* Extend the max content shown in profile limit  
  * MAX\_CONTENT\_SHOWN \= 3  
* Extend the number of saveable ads  
  * MAX\_SAVABLE\_ADS \= 10  
* Unlimited expiration date for ads  
  * EXPIRATION\_DATE\_DAY\_LIMIT \= 30  
* See who visited your profile  
  * SEE\_PROFILE\_VISITS \= false

## Subscription

Subscribe with 4,99 € to have all the freemium functionalities ON

## Pay to download app

Doesn’t seem a great idea TBH  
But it could be like 0.99€ in the iOS app store just to cover costs of licensing and all

## In app purchase

Buy points to spend in the store.

Points are earned

* From the store at a certain price  
* Inviting friends in the app (when they confirm the account)  
* Special events

### Pay per-use functionalities

* Pin ad in area (cost differs, if the area is wide is high)   
  * AD\_PINNABLE \= false  
* Boost your profile  
  * PROFILE\_BOOSTED \= false  
* Boost your ad  
  * AD\_BOOSTED \= false

## Partnerships

This is really forward but booking agencies, organizers and places could pay a fee to be on the platform, artists and music lovers are always free users

# **Features roadmap**

After the MVP, if it works, this is a list of features put in a roadmap, remember that things may change.

## v1.0.0 \- Every music lives

* Basics  
  * Login with Google OAuth2  
  * Login with Email+Pass and email verification (requires mailing system)  
  * Session management  
  * Back button  
  * App bar below? for navigation  
  * Logout  
* Datasets  
  * Genre list taken from a subset of the ones in [here](https://everynoise.com/)  
  * Instruments list hardcoded (distinguish 6-7-8 strings guitar)  
  * City/Area/State list taken from [here](https://github.com/dr5hn/countries-states-cities-database)  
* Initial tour to show the app functionality  
* Artist Profile creation/editing  
  * Profile picture  
  * Anagraphic info \- name, surname, artist name, age, city, biography (NO GENDER nor pronouns to avoid LGBTQIA+ issues)  
  * Instruments played \- name, years of experience, self evaluation level  
  * Projects \- name, years of activity, instruments played, links  
  * Contacts \- telegramID, whatsapp, signal, etc.  
  * Content \- Links, Videos, Spotify, etc.  
* Ads creation/editing  
  * Ad Picture  
  * Title  
  * Expiration date  
  * Instrument list  
  * Genre list  
  * Area \- city, state, region, remote \-  
  * Is a cover band (yes/no)  
  * Description  
  * Content \- Links, Videos, Spotify, etc.  
  * Delete  
  * Publish/unpublish (instead of deleting it, it could be useful)  
* Search and interact with ads  
  * Filter on  
    * Instrument  
    * Genre  
    * Area \+ distance  
    * Cover band (yes/no)  
  * Order by (any orderable field)  
  * Save ad and consult it later in a dedicated section “Your ads”  
  * Save filters and get notifications when a new ad matching your filter goes ON  
  * Like/Dislike ad (considered in ranking and shown only to creator)  
* Search and interact with profiles  
  * Filter on  
    * Name  
    * Instrument  
    * Genre  
    * Area \+ distance  
  * Order by (any orderable field)  
  * Follow and send a notification to the followed person  
  * See profile  
  * Block user  
  * Flag user   
    * inappropriate language  
    * fake profile using other photos  
* Settings  
  * Choose language  
    * English  
    * Dutch  
    * Italian?  
  * Enable/Disable \- Allow/Disallow  
    * Darkmode  
    * Google login (collect 0 data apart from the email)  
    * Contact synch (to find friends faster but number is not collected)  
      * \- In a future version we could collect it for OTP Authentication  
    * Media permissions (just used for the profile picture)  
    * Location permissions (not compulsories for using the app)  
  * Notifications (in app, push, email)  
    * in-app icon and notification list  
    * push notification send (Firebase?)  
    * email notification send (Mailchimp?)  
  * Logout

Notification table

| Notification | In app | Push | Email |
| :---- | :---- | :---- | :---- |
| New ad | ✔️ | ✔️ | 🟡 |
| New followers | ✔️ | 🟡 | 🟡 |
| Ads stats | ❌ | 🟡 | 🟡 |
| Ads likes | ❌ | 🟡 | 🟡 |
| Events | ✔️ | ✔️ | ✔️ |
| Offers | ✔️ | ✔️ | ✔️ |
| Profile stats | ❌ | 🟡 | 🟡 |
| Invite friends | ✔️ | ❌ | ❌ |
| Come back | ❌ | 🟡 | ✔️ |
| New min. version | ✔️ | ❌ | ❌ |
| New maj. version | ✔️ | ✔️ | ✔️ |

* Help  
  * Report a bug form  
  * Contact us form  
  * Read static infos  
    * About the app/dev  
    * Work with us  
    * GDPR  
    * Privacy policy  
    * Cookie policy  
    * Terms of Use  
  * Delete profile according to GDPR

## v2.0.0 \- Community update

Profile

* Flag as “open to” new projects \- automatically ON if the user created ads  
* Send a message to a member  
* Verification (with blue tick)  
  * via photo holding a message \- facial recognition  
  * document scan / check

Ads

* Reply to the ad directly in app  
* Who created the app gets a dashboard with who applied for it

Chat

* In-app message system for ads (and members?)

Settings

* 2-factor authentication   
  * SMS  
  * Email  
  * Authenticator App

## v3.0.0 \- Bands are here\!

* Band profile  
  * New kind of profile  
    * you can create a group with a leader  
    * you can add/remove members  
    * you can verify the profile  
  * Band name  
  * Members and timeline  
  * EP/LP  
  * Spotify/Youbube/SoundCloud and every link  
  * Description  
  * Genre  
  * FFO  
    * pick similar bands  
    * algorithm pick similar bands (using spotify?)  
  * Location/Area  
  * “Open to”  
    * Tours  
    * Live  
    * Support acts  
    * Endorsements  
  * Automatically publish in a feed for your followers (or notify them) if you have new youtube videos, spotify publications etc.  
  * Can create an ad (only leader? or maybe set permissions in profile settings)  
* Band calendar  
  * Schedule rehearsals \- using google calendar and maps  
  * Set reminders  
* Band chat  
  * Chat with members  
  * Share audio files  
  * Share pictures  
* Artist profile  
  * Reviews  
    * Receive/write a simple review with stars and text (shown in profile)  
      * Only if you follow each other at the time of review and you approved it  
    * Leave a star rate on profile  
      * Anonymous  
* Organize rehearsals

## v4.0.0 \- Events ON

* Music lover profile  
  * New kind of profile  
  * Name  
  * Profile pic  
  * Bio  
  * Contacts  
  * Followed bands  
  * Followed artists  
  * Past events  
  * Next events  
* Venue profile  
  * New kind of profile  
  * Name  
  * Photos  
    * Inside  
    * Outside  
  * Location (with map)  
  * Parkings nearby  
  * How to reach  
  * Years of activity  
  * Genres  
  * Type of place \- disco, venue, social center, stadium \-  
  * Capacity  
  * This could be unmanaged  
* Organizer profile  
  * New kind of profile  
  * Name  
  * Profile pic  
  * Bio  
  * Work with us  
  * Contacts  
  * Past events  
  * Next events  
* Booking agency profile  
  * New kind of profile  
  * Name  
  * Profile pic  
  * Bio  
  * Bands in roster  
  * Work with us  
  * Contacts  
  * Past events  
  * Next events  
* Organize events \- concerts/festivals  
  * Lineup (with links to artists and/or band profiles)  
    * Headliners  
    * Openers  
  * Organized by  
    * Organization(s)/Booking(s)  
  * Location (see map)  
  * Date and time  
  * Capacity and tickets sold in %  
  * Buy Tickets \- available on \[external links\]  
* Events interaction  
  * Search  
    * Filter by   
      * bands  
      * organized by  
      * location  
      * time  
    * Order by  
      * band name  
      * organizer name  
      * location  
      * date  
  * Add to calendar   
  * Set reminder  
  * Communicate with who attends  
  * Get official communication (door open at, cancellation, refund info, lineup change)  
* Music Label profile  
  * New kind of profile  
  * Name  
  * Profile pic  
  * Bio  
  * Bands under that label  
  * Past events  
  * Next events

## v5.0.0 \- Music Marketplace

* Sell and buy used/new   
  * Musical instruments  
  * Equipement

## v5.0.0 \- Teach and hire\!

* Sell and buy  
  * Lessons/Coaching  
* Hire  
  * Sound Engineer  
  * Driver  
  * Security  
  * Tour Manager  
  * Light Technician  
  * Booking Agency  
  * Graphic Designer  
  * Video Maker  
  * Social Media Manager  
  * Vocal/Drums/Guitar Coach  
  * Instrument companies (endorsements/sponsorships)

# NexaLab authentication specification

## Account identifiers

| Role | Identifier | Provisioning | Recovery |
| --- | --- | --- | --- |
| Student | Unique username | Teacher or school | Teacher issues a new temporary password |
| Teacher | Unique email | Admin or approved school process | Email reset |
| Parent | Unique email | Self registration with consent | Email reset |
| Admin | Unique email | Existing admin or system process | Email reset |

Student email is optional and is not used for sign in. Adult username is optional and is not used for sign in. Database constraints require the identifier appropriate to each role.

## Student lifecycle

1. A teacher who owns a class provisions a student with full name, username, grade and recorded school consent.
2. The API creates a random temporary password, stores only its Argon2 hash and sets a 24 hour expiry.
3. The API returns the temporary credential once. It must be delivered privately.
4. The student signs in through `/auth/student/login`.
5. While `mustChangePassword` is true, the API permits only session inspection, password change and logout.
6. Password change clears the temporary expiry and revokes all existing sessions. The student signs in again with the new password.
7. A teacher may reset only a student enrolled in a class owned by that teacher. Reset repeats steps 2 through 6.

## Adult lifecycle

Adult users sign in through `/auth/login`. Student accounts are deliberately rejected at this endpoint even if a legacy student record contains an email. Parent self registration is the only open registration flow in the MVP. Email reset never reveals whether an address exists.

## Codes and sessions

Temporary passwords authenticate a student. Class join codes create enrollment requests. Parent link codes create verified parent to student relationships. They are generated, validated and consumed independently.

Access tokens remain short lived and are kept in browser memory. Refresh tokens are stored as hashes in the database and sent only through an HttpOnly, Secure in production, SameSite Strict cookie. Password change, password reset and teacher reset revoke existing refresh sessions.

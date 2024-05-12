export type SocialNetworKCredential = {
  type: 'discord' | 'twitter';
  emailOrUsername: string;
  password: string;
};

export const credentials = [
  {
    type: 'twitter',
    emailOrUsername: 'username1',
    password: 'password',
  },
  {
    type: 'discord',
    emailOrUsername: 'username2',
    password: 'password',
  },
];

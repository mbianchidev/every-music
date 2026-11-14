import BandCalendar from './BandCalendar.jsx';
import BandChat from './BandChat.jsx';

// Member-only band tools on a band page: the shared calendar and the
// end-to-end encrypted band chat.
export default function BandWorkspace({ organization, route }) {
  return <>
    <BandCalendar organization={organization} />
    <BandChat organization={organization} focus={route?.query.get('section') === 'chat'} />
  </>;
}

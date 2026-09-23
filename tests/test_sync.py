import unittest
from scripts.sync_results import normalize
class SyncTest(unittest.TestCase):
 def test_penalties_use_90_minutes(self):
  m={'fixture':{'status':{'short':'PEN'},'date':'2026-11-01T20:00:00-06:00'},'score':{'fulltime':{'home':1,'away':1}},'goals':{'home':2,'away':1}}
  self.assertEqual(normalize(m)['p_home'],1)
  self.assertEqual(normalize(m)['p_away'],1)
  self.assertEqual(normalize(m)['p_status'],'finished')
 def test_unknown_does_not_invent_result(self):
  self.assertIsNone(normalize({'fixture':{'status':{'short':'AWD'}}}))
if __name__=='__main__':unittest.main()

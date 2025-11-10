import { Link } from 'expo-router'
import { StyleSheet, Text, View, Image } from 'react-native'
import logo from "../assets/logo.png"
import Spacer from '../components/Spacer'
import CustomView from '../components/CustomView'

const Home = () => {
  return (
    <CustomView style={styles.container }>
      <Image source={logo} style={styles.logo} />

      <Text>Daily affirmations crafted uniquely for you</Text>
      
      <Spacer height={200} />
      <View style={styles.btnRow }>
      <Link style={[styles.btn, styles.registerBtn]} href="/register"><Text>Get started</Text></Link>
        <Link style={[styles.btn, styles.loginBtn]} href="/login"><Text>
        Login</Text></Link>
     </View>
    </CustomView>
  )
}

export default Home

const styles = StyleSheet.create({

  logo: {
    width: 140,
    height: 90,
    resizeMode: "contain"
  },
  btn: {
    paddingVertical: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: "solid",
    textAlign: "center",
    fontSize: 18,
    fontWeight: "500"
  },
  loginBtn: {
    borderColor:"#C49EBB"
  },
  registerBtn: {
    borderWidth:0,
    backgroundColor: "#FF6F61",
    color: "#FFFFFF"
  },
  btnRow: {
    flexDirection: "column",
    gap: 12,
    minWidth: "80%",
  } 
})